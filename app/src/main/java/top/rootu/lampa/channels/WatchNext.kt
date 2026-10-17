package top.rootu.lampa.channels

import android.annotation.SuppressLint
import android.content.ContentProviderOperation
import android.net.Uri
import android.util.Log
import androidx.core.net.toUri
import androidx.tvprovider.media.tv.TvContractCompat
import androidx.tvprovider.media.tv.TvContractCompat.PreviewProgramColumns.ASPECT_RATIO_16_9
import androidx.tvprovider.media.tv.TvContractCompat.PreviewProgramColumns.ASPECT_RATIO_2_3
import androidx.tvprovider.media.tv.TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE
import androidx.tvprovider.media.tv.TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_NEXT
import androidx.tvprovider.media.tv.TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_WATCHLIST
import androidx.tvprovider.media.tv.TvContractCompat.buildWatchNextProgramUri
import androidx.tvprovider.media.tv.WatchNextProgram
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import top.rootu.lampa.App
import top.rootu.lampa.PlayerStateManager
import top.rootu.lampa.content.LampaProvider
import top.rootu.lampa.helpers.Helpers
import top.rootu.lampa.helpers.Helpers.debugLog
import top.rootu.lampa.helpers.Helpers.getDefaultPosterUri
import top.rootu.lampa.helpers.Helpers.isTvContentProviderAvailable
import top.rootu.lampa.helpers.Prefs.CUB
import top.rootu.lampa.helpers.Prefs.FAV
import top.rootu.lampa.helpers.Prefs.isInWatchNext
import top.rootu.lampa.helpers.Prefs.syncEnabled
import top.rootu.lampa.helpers.Prefs.wathToRemove
import top.rootu.lampa.helpers.capitalizeFirstLetter
import top.rootu.lampa.models.LAMPA_CARD_KEY
import top.rootu.lampa.models.LampaCard

object WatchNext {
    private const val TAG = "WatchNext"

    @SuppressLint("RestrictedApi")
    private val WATCH_NEXT_MAP_PROJECTION = arrayOf(
        TvContractCompat.BaseTvColumns._ID,
        TvContractCompat.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID,
        TvContractCompat.WatchNextPrograms.COLUMN_BROWSABLE
    )

    @SuppressLint("RestrictedApi")
    fun add(card: LampaCard) {
        if (!isTvContentProviderAvailable) return
        card.id?.let { movieId ->
            val existingProgram = findProgramByMovieId(movieId)
            val removed = removeIfNotBrowsable(existingProgram)
            val shouldUpdateProgram = existingProgram != null && !removed
            if (shouldUpdateProgram) {
                val contentValues =
                    WatchNextProgram.Builder(existingProgram).build().toContentValues()
                val rowsUpdated = App.context.contentResolver.update(
                    buildWatchNextProgramUri(existingProgram.id),
                    contentValues, null, null
                )
                if (rowsUpdated < 1) {
                    Log.e(TAG, "Failed to update Watch Next program ${existingProgram.id}")
                }
            } else {
                val programUri = App.context.contentResolver.insert(
                    TvContractCompat.WatchNextPrograms.CONTENT_URI,
                    createWatchNextProgram(card).toContentValues()
                )
                if (programUri == null || programUri == Uri.EMPTY) {
                    Log.e(TAG, "Failed to insert movie $movieId into the Watch Next")
                }
            }
        }
    }

    fun rem(movieId: String?) {
        if (!isTvContentProviderAvailable) return
        movieId?.let { deleteFromWatchNext(it) }
    }

    @SuppressLint("RestrictedApi")
    suspend fun updateWatchNext() = withContext(Dispatchers.Default) {
        if (!isTvContentProviderAvailable) return@withContext
        val context = App.context

        val lst = when {
            context.syncEnabled -> context.CUB
                ?.filter { it.type == LampaProvider.LATE }
                ?.sortedBy { it.time }
                ?.mapNotNull { it.data?.also { data -> data.fixCard() } }
                .orEmpty()
            else -> context.FAV?.card
                ?.filter { context.FAV?.wath?.contains(it.id) == true }
                ?.sortedByDescending { context.FAV?.wath?.indexOf(it.id) }
                ?.onEach { it.fixCard() }
                .orEmpty()
        }

        val (excludePending, pending) = lst.partition {
            !context.wathToRemove.contains(it.id.toString())
        }
        debugLog(
            TAG,
            "updateWatchNext() WatchNext items: ${excludePending.size} ${excludePending.map { it.id }}"
        )
        debugLog(
            TAG,
            "updateWatchNext() WatchNext items pending to remove: ${pending.size} ${pending.map { it.id }}"
        )

        val operations = ArrayList<ContentProviderOperation>()
        val existingPrograms = mutableMapOf<String, WatchNextProgram>()

        // Single query to inspect all current WatchNext programs
        context.contentResolver.query(
            TvContractCompat.WatchNextPrograms.CONTENT_URI,
            WATCH_NEXT_MAP_PROJECTION,
            null,
            null,
            null
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                do {
                    val program = WatchNextProgram.fromCursor(cursor)
                    val providerId = program.internalProviderId
                    if (providerId.isNullOrEmpty() || !context.isInWatchNext(providerId) || !program.isBrowsable) {
                        operations.add(
                            ContentProviderOperation.newDelete(buildWatchNextProgramUri(program.id)).build()
                        )
                    } else {
                        existingPrograms[providerId] = program
                    }
                } while (cursor.moveToNext())
            }
        }

        for (card in excludePending) {
            val movieId = card.id ?: continue
            val existing = existingPrograms[movieId]
            if (existing != null) {
                val values = WatchNextProgram.Builder(existing).build().toContentValues()
                operations.add(
                    ContentProviderOperation.newUpdate(buildWatchNextProgramUri(existing.id))
                        .withValues(values)
                        .build()
                )
            } else {
                val values = createWatchNextProgram(card).toContentValues()
                operations.add(
                    ContentProviderOperation.newInsert(TvContractCompat.WatchNextPrograms.CONTENT_URI)
                        .withValues(values)
                        .build()
                )
            }
        }

        if (operations.isNotEmpty()) {
            try {
                context.contentResolver.applyBatch(TvContractCompat.AUTHORITY, operations)
            } catch (e: Exception) {
                Log.e(TAG, "Batch updateWatchNext failed: ${e.message}")
            }
        }
    }

    fun addLastPlayed(card: LampaCard, lampaActivity: String) {
        if (!isTvContentProviderAvailable) return

        card.id?.let { movieId ->
            deleteFromWatchNext(movieId)

            val programUri = App.context.contentResolver.insert(
                TvContractCompat.WatchNextPrograms.CONTENT_URI,
                createWatchNextProgram(card, true, lampaActivity).toContentValues()
            )

            if (programUri == null) {
                Log.e(TAG, "Failed to insert continue watch for $movieId")
            }
        }
    }

    fun removeContinueWatch(card: LampaCard) {
        if (!isTvContentProviderAvailable) return
        card.id?.let { movieId -> deleteFromWatchNext(movieId) }
    }

    @SuppressLint("RestrictedApi")
    fun getInternalIdFromWatchNextProgramId(watchNextId: Long): String? {
        return App.context.contentResolver.query(
            buildWatchNextProgramUri(watchNextId), null, null, null, null
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                val watchNextProgram = WatchNextProgram.fromCursor(cursor)
                watchNextProgram?.internalProviderId
            } else null
        }
    }

    @SuppressLint("RestrictedApi")
    fun getCardFromWatchNextProgramId(watchNextId: Long): LampaCard? {
        return App.context.contentResolver.query(
            buildWatchNextProgramUri(watchNextId), null, null, null, null
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                val watchNextProgram = WatchNextProgram.fromCursor(cursor)
                val json = watchNextProgram?.intent?.getStringExtra(LAMPA_CARD_KEY)
                Helpers.getJson(json, LampaCard::class.java)
            } else null
        }
    }

    @SuppressLint("RestrictedApi")
    private fun deleteFromWatchNext(movieId: String) {
        val program = findProgramByMovieId(movieId)
        program?.let {
            debugLog(TAG, "deleteFromWatchNext($movieId) removeProgram(${it.id})")
            removeProgram(it.id)
        }
    }

    @SuppressLint("RestrictedApi")
    private fun findProgramByMovieId(movieId: String): WatchNextProgram? {
        App.context.contentResolver.query(
            TvContractCompat.WatchNextPrograms.CONTENT_URI,
            WATCH_NEXT_MAP_PROJECTION,
            null,
            null,
            null
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                do {
                    val program = WatchNextProgram.fromCursor(cursor)
                    if (movieId == program.internalProviderId) {
                        return program
                    }
                } while (cursor.moveToNext())
            }
        }
        return null
    }

    @SuppressLint("RestrictedApi")
    private fun removeIfNotBrowsable(program: WatchNextProgram?): Boolean {
        if (program?.isBrowsable == false) {
            removeProgram(program.id)
            return true
        }
        return false
    }

    private fun removeProgram(watchNextProgramId: Long): Int {
        return App.context.contentResolver.delete(
            buildWatchNextProgramUri(watchNextProgramId),
            null, null
        ).also {
            if (it < 1) Log.e(TAG, "Failed to delete program $watchNextProgramId from Watch Next")
        }
    }

    @SuppressLint("RestrictedApi")
    private fun createWatchNextProgram(
        card: LampaCard,
        resume: Boolean = false,
        activityJson: String? = null
    ): WatchNextProgram {
        val info = mutableListOf<String>()
        val programId = card.id

        val state = if (resume) {
            PlayerStateManager(App.context).findStateByCard(card)
        } else {
            null
        }
        val currentItem = state?.currentItem

        var title = card.title
        val isSeries = card.type == "tv" ||
                currentItem?.season != null ||
                currentItem?.episode != null ||
                (state != null && state.playlist.size > 1)

        var type = TvContractCompat.WatchNextPrograms.TYPE_MOVIE
        val seasonNum = currentItem?.season
        val episodeNum = currentItem?.episode
            ?: if (isSeries && state != null && state.playlist.size > 1) state.currentIndex + 1 else null
        val episodeTitle = currentItem?.title?.takeIf { it.isNotBlank() && it != title && it != card.name }

        if (isSeries) {
            if (!card.name.isNullOrEmpty()) title = card.name
            type = if (resume) TvContractCompat.WatchNextPrograms.TYPE_TV_EPISODE
            else TvContractCompat.WatchNextPrograms.TYPE_TV_SERIES

            if (resume && (seasonNum != null || episodeNum != null)) {
                val seTag = when {
                    seasonNum != null && episodeNum != null -> "S%02dE%02d".format(seasonNum, episodeNum)
                    episodeNum != null -> "E%02d".format(episodeNum)
                    else -> "S$seasonNum"
                }
                info.add(seTag)
            } else {
                card.number_of_seasons?.takeIf { it > 0 }?.let {
                    info.add("S$it")
                }
            }
        }

        // Add vote average if present and > 0
        card.vote_average?.takeIf { it > 0.0 }?.let {
            info.add("%.1f".format(it))
        }

        // Add genres if present
        card.genres?.mapNotNull {
            it?.name?.capitalizeFirstLetter()?.takeIf { genre -> genre.isNotBlank() }
        }?.takeIf { it.isNotEmpty() }?.joinToString(", ")?.let {
            info.add(it)
        }

        val (positionMs, durationMs) = state?.run {
            val timeline = currentItem?.timeline
            val pos = timeline?.time?.times(1000)?.toLong()?.takeIf { it > 0L }
                ?: currentPosition
            val dur = timeline?.duration?.times(1000)?.toLong() ?: 0L
            pos to dur
        } ?: (0L to 0L)

        // When previous episode finished and state advanced to the next episode (positionMs == 0 && currentIndex > 0),
        // mark as WATCH_NEXT_TYPE_NEXT ("Up Next" on Android TV), otherwise WATCH_NEXT_TYPE_CONTINUE.
        val watchType = when {
            !resume -> WATCH_NEXT_TYPE_WATCHLIST
            positionMs <= 0L && state != null && state.currentIndex > 0 -> WATCH_NEXT_TYPE_NEXT
            else -> WATCH_NEXT_TYPE_CONTINUE
        }

        val description = if (resume && !episodeTitle.isNullOrEmpty()) {
            if (!card.overview.isNullOrBlank()) "$episodeTitle — ${card.overview}" else episodeTitle
        } else {
            card.overview
        }

        val builder = WatchNextProgram.Builder()
            .setType(type)
            .setWatchNextType(watchType)
            .setLastEngagementTimeUtcMillis(System.currentTimeMillis())
            .setTitle(title)
            .setDescription(description)
            .setGenre(info.joinToString(" · "))
            .setReviewRating((card.vote_average?.div(2) ?: 0).toString())
            .setIntent(Helpers.buildPendingIntent(card, resume, activityJson))
            .setInternalProviderId(programId)
            .setDurationMillis(card.runtime?.times(60000) ?: 0)
            .setReleaseDate(card.release_year)
            .setSearchable(true)
            .setLive(false)

        if (type == TvContractCompat.WatchNextPrograms.TYPE_TV_EPISODE) {
            if (seasonNum != null && seasonNum > 0) {
                builder.setSeasonNumber(seasonNum)
            }
            if (episodeNum != null && episodeNum > 0) {
                builder.setEpisodeNumber(episodeNum)
            }
            if (!episodeTitle.isNullOrEmpty()) {
                builder.setEpisodeTitle(episodeTitle)
            }
        }

        if (resume && positionMs > 0 && durationMs > 0) {
            builder.setLastPlaybackPositionMillis(positionMs.toInt())
                .setDurationMillis(durationMs.toInt())
        }

        val posterUri = card.img?.toUri() ?: getDefaultPosterUri()
        builder.setPosterArtUri(posterUri)
            .setPosterArtAspectRatio(ASPECT_RATIO_2_3)

        val thumbUrl = currentItem?.thumbnail?.takeIf { it.isNotEmpty() }
            ?: card.background_image?.takeIf { it.isNotEmpty() }
        if (!thumbUrl.isNullOrEmpty()) {
            builder.setThumbnailUri(thumbUrl.toUri())
                .setThumbnailAspectRatio(ASPECT_RATIO_16_9)
        }

        return builder.build()
    }
}