package top.rootu.lampa.net

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import top.rootu.lampa.helpers.Helpers.debugLog
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Provides deep integration with TorrServer MatriX:
 * 1. Canonical matching of stream URLs by `(hash, fileIndex)` regardless of filename encoding or `&play` flags.
 * 2. Two-way sync of watched episodes with TorrServer's internal `/viewed` database (`POST /viewed`).
 * 3. Non-blocking pre-warming (`&preload`) of the next episode in a series playlist.
 */
object TorrServerSync {
    private const val TAG = "TorrServerSync"
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val URL_BASE_REGEX = Regex("""^(https?://[^/?#]+)(/[^?#]*)?(?:\?([^#]*))?""", RegexOption.IGNORE_CASE)
    private val PLAY_PATH_REGEX = Regex("""^/play/([^/]+)/(\d+)""", RegexOption.IGNORE_CASE)
    private val TRANSIENT_FLAGS_REGEX = Regex("""([?&])(play|preload|stat)(?:=[^&]*)?(?=&|$)""", RegexOption.IGNORE_CASE)

    data class TorrServerRef(
        val baseUrl: String,
        val hash: String,
        val fileIndex: Int
    )

    /**
     * Extracts `(baseUrl, hash, fileIndex)` if [url] is a TorrServer stream URL.
     */
    fun extractRef(url: String?): TorrServerRef? {
        if (url.isNullOrBlank()) return null
        val trimmed = url.trim()
        val match = URL_BASE_REGEX.find(trimmed) ?: return null
        val baseUrl = match.groupValues[1]
        val path = match.groupValues[2]
        val query = match.groupValues[3]

        // Standard TorrServer MatriX format: /stream/fname.mkv?link=<hash>&index=<idx>&play
        if (path.startsWith("/stream", ignoreCase = true) || path.startsWith("/play", ignoreCase = true)) {
            if (query.isNotEmpty()) {
                var hash: String? = null
                var index: Int? = null
                for (pair in query.split('&')) {
                    if (pair.isEmpty()) continue
                    val eq = pair.indexOf('=')
                    if (eq <= 0) continue
                    val key = pair.substring(0, eq).lowercase(Locale.ROOT)
                    val rawVal = pair.substring(eq + 1)
                    when (key) {
                        "link", "hash" -> if (hash == null) {
                            hash = decodeUrlComponent(rawVal).trim().takeIf { it.isNotEmpty() }
                        }
                        "index", "id" -> if (index == null) {
                            index = rawVal.trim().toIntOrNull()
                        }
                    }
                }
                if (hash != null && index != null) {
                    return TorrServerRef(
                        baseUrl = baseUrl,
                        hash = hash.lowercase(Locale.ROOT),
                        fileIndex = index
                    )
                }
            }
        }

        // Alternative TorrServer path format: /play/<hash>/<index>
        val playMatch = PLAY_PATH_REGEX.find(path)
        if (playMatch != null) {
            val hash = decodeUrlComponent(playMatch.groupValues[1]).trim().takeIf { it.isNotEmpty() }
            val index = playMatch.groupValues[2].toIntOrNull()
            if (hash != null && index != null) {
                return TorrServerRef(
                    baseUrl = baseUrl,
                    hash = hash.lowercase(Locale.ROOT),
                    fileIndex = index
                )
            }
        }

        return null
    }

    /**
     * Checks whether [urlA] and [urlB] refer to the same media stream, accounting for
     * TorrServer `(hash, index)` parameters and URL-encoding differences in Cyrillic/brackets.
     */
    fun isSameStreamUrl(urlA: String?, urlB: String?): Boolean {
        if (urlA.isNullOrBlank() || urlB.isNullOrBlank()) return false
        if (urlA == urlB) return true

        val refA = extractRef(urlA)
        val refB = extractRef(urlB)
        if (refA != null && refB != null) {
            return refA.hash == refB.hash && refA.fileIndex == refB.fileIndex
        }

        return normalizeUrl(urlA) == normalizeUrl(urlB)
    }

    internal fun normalizeUrl(url: String): String {
        val stripped = TRANSIENT_FLAGS_REGEX.replace(url.trim()) { m ->
            if (m.groupValues[1] == "?") "?" else ""
        }.replace("?&", "?").trimEnd('?', '&')
        return decodeUrlComponent(stripped)
    }

    private fun decodeUrlComponent(value: String): String {
        return try {
            // Preserve literal '+' characters when decoding URL paths/queries
            URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8.name())
        } catch (_: Exception) {
            value
        }
    }

    /**
     * Marks one or more TorrServer stream URLs as viewed in TorrServer's `/viewed` database.
     */
    fun markViewedAsync(urls: Collection<String>, headers: Array<String>? = null) {
        val refs = urls.mapNotNull { extractRef(it) }.distinct()
        if (refs.isEmpty()) return

        scope.launch {
            val client = HttpHelper.client.newBuilder()
                .connectTimeout(4, TimeUnit.SECONDS)
                .readTimeout(4, TimeUnit.SECONDS)
                .build()

            for (ref in refs) {
                try {
                    val payload = JSONObject().apply {
                        put("action", "set")
                        put("hash", ref.hash)
                        put("file_index", ref.fileIndex)
                    }.toString()

                    val reqBuilder = Request.Builder()
                        .url("${ref.baseUrl}/viewed")
                        .post(payload.toRequestBody(JSON_MEDIA_TYPE))

                    applyAuthHeaders(reqBuilder, headers)

                    client.newCall(reqBuilder.build()).execute().use { response ->
                        debugLog(
                            TAG,
                            "Marked viewed in TorrServer [hash=${ref.hash}, index=${ref.fileIndex}, code=${response.code}]"
                        )
                    }
                } catch (e: Exception) {
                    debugLog(TAG, "TorrServer /viewed sync skipped: ${e.message}")
                }
            }
        }
    }

    /**
     * Triggers non-blocking pre-warming (`&preload`) of the next episode in TorrServer RAM cache.
     */
    fun preloadEpisodeAsync(url: String?, headers: Array<String>? = null) {
        val ref = extractRef(url) ?: return
        scope.launch {
            try {
                val encodedHash = URLEncoder.encode(ref.hash, StandardCharsets.UTF_8.name())
                val preloadUrl =
                    "${ref.baseUrl}/stream?link=$encodedHash&index=${ref.fileIndex}&preload"
                val client = HttpHelper.client.newBuilder()
                    .connectTimeout(3, TimeUnit.SECONDS)
                    .readTimeout(5, TimeUnit.SECONDS)
                    .build()

                val reqBuilder = Request.Builder()
                    .url(preloadUrl)
                    .get()
                applyAuthHeaders(reqBuilder, headers)

                client.newCall(reqBuilder.build()).execute().use { response ->
                    debugLog(
                        TAG,
                        "Preloaded next episode in TorrServer [hash=${ref.hash}, index=${ref.fileIndex}, code=${response.code}]"
                    )
                }
            } catch (e: Exception) {
                debugLog(TAG, "TorrServer preload skipped: ${e.message}")
            }
        }
    }

    private fun applyAuthHeaders(builder: Request.Builder, headers: Array<String>?) {
        if (headers == null) return
        var i = 0
        while (i + 1 < headers.size) {
            val k = headers[i]
            val v = headers[i + 1]
            if (k.equals("Authorization", ignoreCase = true) ||
                k.equals("Cookie", ignoreCase = true) ||
                k.equals("User-Agent", ignoreCase = true)
            ) {
                builder.header(k, v)
            }
            i += 2
        }
    }
}
