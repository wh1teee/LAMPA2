package top.rootu.lampa

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.SharedPreferences
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.core.content.edit
import androidx.core.net.toUri
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONException
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import top.rootu.lampa.browser.Browser
import top.rootu.lampa.channels.LampaChannels
import top.rootu.lampa.channels.PluginChannels
import top.rootu.lampa.channels.LampaChannels.updateChanByName
import top.rootu.lampa.channels.WatchNext.updateWatchNext
import top.rootu.lampa.content.LampaProvider
import top.rootu.lampa.helpers.Helpers
import top.rootu.lampa.helpers.Helpers.debugLog
import top.rootu.lampa.helpers.Helpers.filterValidCubBookmarks
import top.rootu.lampa.helpers.Helpers.isTvContentProviderAvailable
import top.rootu.lampa.helpers.Helpers.isValidJson
import top.rootu.lampa.helpers.Prefs.appLang
import top.rootu.lampa.helpers.Prefs.lampaSource
import top.rootu.lampa.helpers.Prefs.saveAccountBookmarks
import top.rootu.lampa.helpers.Prefs.saveFavorite
import top.rootu.lampa.helpers.Prefs.saveRecs
import top.rootu.lampa.helpers.Prefs.storagePrefs
import top.rootu.lampa.helpers.Prefs.syncEnabled
import top.rootu.lampa.helpers.Prefs.tmdbApiUrl
import top.rootu.lampa.helpers.Prefs.tmdbImgUrl
import top.rootu.lampa.helpers.AppAttestation
import top.rootu.lampa.net.Http
import top.rootu.lampa.tmdb.TMDB
import kotlin.system.exitProcess

class AndroidJS(private val mainActivity: MainActivity, private val browser: Browser) {

    private val store: SharedPreferences = App.context.storagePrefs
    private val memoryStore = ConcurrentHashMap<String, String>()
    private val channelScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val channelUpdateJobs = ConcurrentHashMap<String, Job>()

    // Local properties
    private var lastEventHash: String? = null
    private val reqResponse = ConcurrentHashMap<String, String>()
    private val pendingKeys = java.util.concurrent.ConcurrentLinkedQueue<String>()
    private val inFlightGets = ConcurrentHashMap<String, kotlinx.coroutines.Deferred<JSONObject>>()
    private var keys: Array<String?>? = null
    private var values: Array<String?>? = null
    private var dumped = false

    init {
        store.all?.forEach { (k, v) ->
            if (k != null && v is String) {
                memoryStore[k] = v
            }
        }
    }

    companion object {
        // Constants
        private const val TAG = "AndroidJS"
        private const val UPDATE_DELAY = 5000L // in ms, wait before update TV channel
        private const val MAX_PENDING_RESPONSES = 256
        private val HTTP_METHODS = setOf("DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT")
        private val TORRSERVER_PACKAGES = listOf("ru.yourok.torrserve", "ru.yourok.torrserve.atv")

        @Volatile
        var torrserverAuth: Boolean = false

        @Volatile
        var torrserverLogin: String = ""

        @Volatile
        var torrserverPassword: String = ""

        @Volatile
        var torrserverUrl: String = ""
    }

    private fun scheduleChannelUpdate(channelKey: String, block: suspend () -> Unit) {
        channelUpdateJobs.remove(channelKey)?.cancel()
        channelUpdateJobs[channelKey] = channelScope.launch {
            delay(UPDATE_DELAY)
            block()
        }
    }

    @JavascriptInterface
    fun storageChange(json: String?) {
        val hash = json.hashCode().toString()
        if (hash == lastEventHash) {
            debugLog(TAG, "Ignoring duplicate storage change event: $json")
            return
        }
        lastEventHash = hash
        json?.let {
            val eo: JSONObject = if (json == "\"\"") {
                JSONObject()
            } else {
                try {
                    JSONObject(json)
                } catch (_: Exception) {
                    return
                }
            }
            applyStorageChange(eo)
        }
    }

    @JavascriptInterface
    fun storageChangeBatch(jsonArrayStr: String?) {
        if (jsonArrayStr.isNullOrBlank()) return
        try {
            val arr = org.json.JSONArray(jsonArrayStr)
            for (i in 0 until arr.length()) {
                val eo = arr.optJSONObject(i) ?: continue
                applyStorageChange(eo)
            }
        } catch (e: Exception) {
            debugLog(TAG, "storageChangeBatch failed: ${e.message}")
        }
    }

    private fun applyStorageChange(eo: JSONObject) {
        if (!eo.has("name") || !eo.has("value")) return

        when (eo.optString("name")) {
            "activity" -> {
                MainActivity.lampaActivity = eo.optString("value", "{}")
                debugLog(TAG, "lampaActivity stored: ${MainActivity.lampaActivity}")
                mainActivity.onCardActivityEntered(MainActivity.lampaActivity)
            }

            "player_timecode" -> {
                MainActivity.playerTimeCode = eo.optString("value", MainActivity.playerTimeCode)
                debugLog(TAG, "playerTimeCode stored: ${MainActivity.playerTimeCode}")
            }

            "playlist_next" -> {
                MainActivity.playerAutoNext = eo.optString("value", "true") == "true"
                debugLog(TAG, "playerAutoNext stored: ${MainActivity.playerAutoNext}")
            }

            "torrserver_auth" -> {
                torrserverAuth = eo.optString("value", "false").equals("true", ignoreCase = true) ||
                        eo.optBoolean("value", false)
                debugLog(TAG, "torrserverAuth stored: $torrserverAuth")
            }

            "torrserver_login" -> {
                val raw = eo.optString("value", "")
                torrserverLogin = if (raw == "undefined" || raw == "null") "" else raw
                debugLog(TAG, "torrserverLogin updated")
            }

            "torrserver_password" -> {
                val raw = eo.optString("value", "")
                torrserverPassword = if (raw == "undefined" || raw == "null") "" else raw
                debugLog(TAG, "torrserverPassword updated")
            }

            "torrserver_url" -> {
                val raw = eo.optString("value", "")
                torrserverUrl = if (raw == "undefined" || raw == "null") "" else raw
                debugLog(TAG, "torrserverUrl stored: $torrserverUrl")
                if (torrserverUrl.isNotEmpty()) {
                    val withScheme = if (torrserverUrl.contains("://")) torrserverUrl else "http://$torrserverUrl"
                    top.rootu.lampa.net.HttpHelper.preconnectAsync(withScheme)
                }
            }

            "language" -> {
                val newLang = eo.optString("value", "ru")
                if (newLang != "undefined" && mainActivity.appLang != newLang) {
                    App.setAppLanguage(mainActivity, newLang)
                    debugLog(TAG, "language changed to $newLang")
                } else {
                    debugLog(TAG, "language not changed [${mainActivity.appLang}]")
                }
            }

            "source" -> {
                mainActivity.lampaSource = eo.optString("value", mainActivity.lampaSource)
                debugLog(TAG, "lampaSource stored: ${mainActivity.lampaSource}")
            }

            "protocol" -> {
                if (MainActivity.proxyTmdbEnabled) {
                    debugLog(TAG, "protocol changed. run getLampaTmdbUrls()")
                    mainActivity.getLampaTmdbUrls()
                } else {
                    debugLog(TAG, "protocol changed. TMDB Proxy disabled, nothing to do.")
                }
            }

            "proxy_tmdb" -> {
                val newState = eo.optString("value", "true") == "true"
                MainActivity.proxyTmdbEnabled = newState
                debugLog(TAG, "proxyTmdbEnabled set to $newState")
                if (MainActivity.proxyTmdbEnabled) {
                    mainActivity.getLampaTmdbUrls()
                } else {
                    debugLog(TAG, "Apply default TMDB URLs")
                    mainActivity.tmdbApiUrl = TMDB.APIURL
                    mainActivity.tmdbImgUrl = TMDB.IMGURL
                }
            }

            "baseUrlApiTMDB" -> {
                val newUrl = eo.optString("value", TMDB.APIURL)
                if (newUrl.startsWith("http", true) &&
                    !newUrl.contains(mainActivity.tmdbApiUrl, true)
                ) {
                    mainActivity.tmdbApiUrl = newUrl
                    top.rootu.lampa.net.HttpHelper.preconnectAsync(newUrl)
                    debugLog(
                        TAG,
                        "baseUrlApiTMDB changed, tmdbApiUrl ${mainActivity.tmdbApiUrl}"
                    )
                } else {
                    debugLog(
                        TAG,
                        "baseUrlApiTMDB changed, tmdbApiUrl not changed: ${mainActivity.tmdbApiUrl}"
                    )
                }
            }

            "baseUrlImageTMDB" -> {
                val newUrl = eo.optString("value", TMDB.IMGURL)
                if (newUrl.startsWith("http", true) &&
                    !newUrl.contains(mainActivity.tmdbImgUrl, true)
                ) {
                    mainActivity.tmdbImgUrl = newUrl
                    top.rootu.lampa.net.HttpHelper.preconnectAsync(newUrl)
                    debugLog(
                        TAG,
                        "baseUrlImageTMDB changed, tmdbImgUrl ${mainActivity.tmdbImgUrl}"
                    )
                } else {
                    debugLog(
                        TAG,
                        "baseUrlImageTMDB changed, tmdbImgUrl not changed: ${mainActivity.tmdbImgUrl}"
                    )
                }
            }

            "favorite" -> {
                val json = eo.optString("value", "")
                if (isValidJson(json)) {
                    mainActivity.saveFavorite(json)
                    debugLog(TAG, "favorite JSON saved to prefs")
                } else {
                    Log.e(TAG, "Not valid JSON in favorite")
                }
            }

            "account_use" -> {
                val use = eo.optBoolean("value", false)
                debugLog(TAG, "set syncEnabled $use")
                mainActivity.syncEnabled = use
            }

            "recomends_list" -> {
                val json = eo.optString("value", "")
                if (isValidJson(json)) {
                    mainActivity.saveRecs(json)
                    debugLog(TAG, "recomends_list JSON saved to prefs")
                } else {
                    Log.e(TAG, "Not valid JSON in recomends_list")
                }
            }

            else -> { // no op
            }
        }
    }

    @JavascriptInterface
    fun prefetchHint(url: String?) {
        top.rootu.lampa.net.TorrServerSync.prefetchStreamHint(url)
    }

    @JavascriptInterface
    fun appVersion(): String {
        return BuildConfig.VERSION_NAME + "-" + BuildConfig.VERSION_CODE
    }

    @JavascriptInterface
    fun exit() {
        try {
            mainActivity.runOnUiThread { mainActivity.appExit() }
        } catch (_: Exception) {
            exitProcess(1)
        }
    }

    @JavascriptInterface
    @Throws(JSONException::class)
    fun openTorrentLink(url: String, jsonString: String): Boolean {
        val jsonData = if (jsonString == "\"\"") JSONObject() else JSONObject(jsonString)
        fun Intent.populateTorrentExtras(): Intent = apply {
            jsonData.optString("title").takeIf { it.isNotEmpty() }?.let { title ->
                putExtra("title", title)
                putExtra("displayName", title)
                putExtra("forcename", title)
            }
            jsonData.optString("poster").takeIf { it.isNotEmpty() }?.let { poster ->
                putExtra("poster", poster)
            }
            jsonData.optString("media").takeIf { it.isNotEmpty() }?.let { category ->
                putExtra("category", category)
            }
            jsonData.optJSONObject("data")?.let { dataObj ->
                putExtra("data", dataObj.toString())
            }
        }

        val primaryIntent = Intent(Intent.ACTION_VIEW).apply {
            if (url.startsWith("magnet", ignoreCase = true)) {
                data = url.toUri()
            } else {
                setDataAndType(url.toUri(), "application/x-bittorrent")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            addCategory(Intent.CATEGORY_BROWSABLE)
            populateTorrentExtras()
        }

        mainActivity.runOnUiThread {
            try {
                mainActivity.startActivity(primaryIntent)
            } catch (_: Exception) {
                // Fallback for Android TV 14 (Issue #41) where TorrServer registers http/magnet
                // without mimeType="application/x-bittorrent" or CATEGORY_BROWSABLE.
                var launched = false
                for (pkg in TORRSERVER_PACKAGES) {
                    val pkgIntent = Intent(Intent.ACTION_VIEW, url.toUri()).apply {
                        setPackage(pkg)
                        populateTorrentExtras()
                    }
                    try {
                        mainActivity.startActivity(pkgIntent)
                        launched = true
                        break
                    } catch (_: Exception) {
                    }
                }
                if (!launched) {
                    try {
                        val genericIntent = Intent(Intent.ACTION_VIEW, url.toUri()).populateTorrentExtras()
                        mainActivity.startActivity(genericIntent)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to open torrent link", e)
                        App.toast(R.string.no_torrent_activity_found, true)
                    }
                }
            }
        }
        // Force update Recs to filter viewed
        scheduleChannelUpdate(LampaProvider.RECS) {
            LampaChannels.updateRecsChannel()
        }

        return true
    }

    @JavascriptInterface
    fun openYoutube(str: String) {
        val intent = Intent(
            Intent.ACTION_VIEW,
            "https://www.youtube.com/watch?v=$str".toUri()
        )
        mainActivity.runOnUiThread {
            try {
                mainActivity.startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, e.message, e)
                App.toast(R.string.no_youtube_activity_found, true)
            }
        }
    }

    @JavascriptInterface
    fun openBrowser(url: String) {
        val intent = Intent(Intent.ACTION_VIEW, url.toUri())
        mainActivity.runOnUiThread {
            try {
                mainActivity.startActivity(intent)
            } catch (e: ActivityNotFoundException) {
                Log.e(TAG, "No browser found: ${e.message}")
                App.toast(R.string.no_activity_found, true)
            } catch (e: Exception) {
                Log.e(TAG, "Browser launch failed: ${e.message}", e)
                App.toast(R.string.generic_error, true)
            }
        }
    }

    @JavascriptInterface
    fun clearDefaultPlayer() {
        mainActivity.runOnUiThread {
            mainActivity.setPlayerPackage("", false)
            mainActivity.setPlayerPackage("", true)
            App.toast(R.string.select_player_reset)
        }
    }

    @JavascriptInterface
    fun httpReq(str: String, returnI: Int) {
        debugLog(TAG, "httpReq JSON $str")
        try {
            val jsonObject = JSONObject(str)
            val disableH2 = jsonObject.optBoolean("disableH2", false)

            // Extract all parameters upfront and resolve relative URLs against MainActivity.LAMPA_URL
            val rawUrl = jsonObject.optString("url").trim().takeIf { it.isNotEmpty() }
                ?: throw IllegalArgumentException("URL cannot be empty")
            val url = resolveRequestUrl(rawUrl, MainActivity.LAMPA_URL)
            val data = jsonObject.opt("post_data")
            val returnHeaders = jsonObject.optBoolean("returnHeaders", false)
            // Optional dataType: "base64" forces binary-safe response encoding.
            val dataType = jsonObject.optString("dataType").takeIf { it.isNotEmpty() }
            val timeout = jsonObject.optInt("timeout", 15000).coerceAtLeast(1000)
            // "method" is the common name for the verb; "type" is the older jQuery-style one Lampa sends.
            val requestedMethod = listOf("method", "type")
                .map { jsonObject.optString(it).trim().uppercase(Locale.ROOT) }
                .firstOrNull { it in HTTP_METHODS }
                .orEmpty()

            val headers = JSONObject()
            jsonObject.optJSONObject("headers")?.let { src ->
                val it = src.keys()
                while (it.hasNext()) {
                    val k = it.next()
                    headers.putSafe(k, src.opt(k) ?: "")
                }
            }

            var contentType = jsonObject.optString("contentType")
            var requestContent = ""

            if (data != null && data !== JSONObject.NULL) {
                if (data is String) {
                    requestContent = data
                    contentType = try {
                        JSONObject(requestContent)
                        "application/json"
                    } catch (_: JSONException) {
                        "application/x-www-form-urlencoded"
                    }
                } else if (data is JSONObject) {
                    contentType = "application/json"
                    requestContent = data.toString()
                }
            }
            if (requestedMethod == "GET" || requestedMethod == "HEAD") {
                requestContent = ""
            }
            // Ensure Content-Type header is properly set
            if (requestContent.isNotEmpty()) {
                if (!headers.has("Content-Type")) {
                    if (headers.has("Content-type")) {
                        contentType = headers.optString("Content-type", contentType)
                        headers.remove("Content-type")
                    }
                    if (headers.has("content-type")) {
                        contentType = headers.optString("content-type", contentType)
                        headers.remove("content-type")
                    }
                    headers.putSafe("Content-Type", contentType)
                }
            }
            injectLampaClientHeaders(url, headers)
            val finalRequestContent = requestContent
            val method = requestedMethod.ifEmpty { if (finalRequestContent.isEmpty()) "GET" else "POST" }
            val finalHeaders = headers
            val reqKey = returnI.toString()

            mainActivity.lifecycleScope.launch(Dispatchers.IO) {
                while (reqResponse.size >= MAX_PENDING_RESPONSES) {
                    val oldestKey = pendingKeys.poll() ?: break
                    reqResponse.remove(oldestKey)
                }
                val http = Http(disableH2)
                val result = try {
                    val responseJSON = if (method == "GET" && !disableH2) {
                        val coalesceKey = "$url|${dataType.orEmpty()}|$finalHeaders"
                        val deferred = inFlightGets.computeIfAbsent(coalesceKey) {
                            channelScope.async(Dispatchers.IO) {
                                http.Send(method, url, finalRequestContent, finalHeaders, timeout, dataType)
                            }
                        }
                        try {
                            deferred.await()
                        } finally {
                            inFlightGets.remove(coalesceKey, deferred)
                        }
                    } else {
                        http.Send(method, url, finalRequestContent, finalHeaders, timeout, dataType)
                    }
                    reqResponse[reqKey] = if (returnHeaders) {
                        responseJSON.toString()
                    } else {
                        responseJSON.optString("body", "")
                    }
                    pendingKeys.offer(reqKey)
                    "complite"
                } catch (e: Throwable) {
                    val errorJson = JSONObject().apply {
                        putSafe("status", http.lastErrorCode)
                        putSafe("message", "request error: ${e.message ?: "unknown error"}")
                    }
                    reqResponse[reqKey] = errorJson.toString()
                    pendingKeys.offer(reqKey)
                    debugLog(TAG, "error: ${e.message ?: "unknown error"}")
                    "error"
                }

                withContext(Dispatchers.Main) {
                    val escapedResult = result
                        .replace("\\", "\\\\")
                        .replace("'", "\\'")
                        .replace("\n", "\\\n")
                    val js = "Lampa.Android.httpCall($reqKey, '$escapedResult')"
                    browser.evaluateJavascript(js) { debugLog(TAG, js) }
                }
            }
        } catch (e: Throwable) {
            e.printStackTrace()
        }
    }

    private fun resolveRequestUrl(rawUrl: String, baseUrl: String): String {
        if (rawUrl.startsWith("http://", ignoreCase = true) || rawUrl.startsWith("https://", ignoreCase = true)) {
            return rawUrl
        }
        val cleanBase = baseUrl.trim().trimEnd('/').ifEmpty { "http://lampa.mx" }
        return when {
            rawUrl.startsWith("//") -> {
                val scheme = cleanBase.substringBefore("://", "http")
                "$scheme:$rawUrl"
            }
            rawUrl.startsWith("./") -> "$cleanBase/${rawUrl.removePrefix("./")}"
            rawUrl.startsWith("/") -> "$cleanBase$rawUrl"
            else -> "$cleanBase/$rawUrl"
        }
    }

    @JavascriptInterface
    fun getResp(str: String): String {
        pendingKeys.remove(str)
        return reqResponse.remove(str) ?: ""
    }

    @JavascriptInterface
    fun openPlayer(link: String, jsonStr: String) {
        debugLog(TAG, "openPlayer: $link json:$jsonStr")
        val jsonObject = try {
            JSONObject(jsonStr.ifEmpty { "{}" }).apply {
                if (!has("url")) {
                    putSafe("url", link)
                }
            }
        } catch (_: Exception) {
            JSONObject().apply { putSafe("url", link) }
        }

        mainActivity.runOnUiThread { mainActivity.runPlayer(jsonObject) }

        // Force update Recs to filter viewed
        scheduleChannelUpdate(LampaProvider.RECS) {
            LampaChannels.updateRecsChannel()
        }
    }

    @JavascriptInterface
    fun setProxyPAC(link: String): Boolean {
        return Http.setProxyPAC(link)
    }

    @JavascriptInterface
    fun getProxyPAC(): String {
        return Http.getProxyPAC()
    }

    @JavascriptInterface
    fun voiceStart() {
        // Голосовой ввод с последующей передачей результата через JS
        mainActivity.runOnUiThread {
            try {
                mainActivity.displaySpeechRecognizer()
            } catch (e: Exception) {
                e.printStackTrace()
                // Очищаем поле ввода
                mainActivity.runVoidJsFunc("window.voiceResult", "''")
            }
        }
    }

    /**
     * Saves valid bookmarks after filtering out invalid ones.
     *
     * @param json The JSON string containing bookmarks.
     */
    @JavascriptInterface
    fun saveBookmarks(json: String?) {
        debugLog(TAG, "saveBookmarks fired!")
        channelScope.launch {
            // Filter out invalid CubBookmark objects
            val validBookmarks = filterValidCubBookmarks(json)
            if (validBookmarks.isNotEmpty()) {
                debugLog(TAG, "saveBookmarks - found ${validBookmarks.size} valid elements")
                // Save the valid bookmarks
                mainActivity.saveAccountBookmarks(Helpers.gson.toJson(validBookmarks))
            } else {
                Log.e(TAG, "saveBookmarks - no valid CUB bookmarks found in the JSON")
            }
        }
    }

    @JavascriptInterface
    fun updateChannel(where: String?) {
        // https://github.com/yumata/lampa-source/blob/e5505b0e9cf5f95f8ec49bddbbb04086fccf26c8/src/app.js#L203
        if (where != null && isTvContentProviderAvailable) {
            debugLog(TAG, "updateChannel [$where]")
            when (where) {
                LampaProvider.HIST,
                LampaProvider.BOOK,
                LampaProvider.LIKE,
                LampaProvider.LOOK,
                LampaProvider.VIEW,
                LampaProvider.SCHD,
                LampaProvider.CONT,
                LampaProvider.THRW -> {
                    scheduleChannelUpdate(where) {
                        updateChanByName(where)
                    }
                }

                LampaProvider.LATE -> {
                    scheduleChannelUpdate(LampaProvider.LATE) {
                        updateWatchNext()
                    }
                }
            }
        }
    }

    /** Returns queue acceptance, not completion of the TV provider write. */
    @JavascriptInterface
    fun publishPluginChannel(json: String?): Boolean = PluginChannels.publish(json)

    @JavascriptInterface
    fun clearPluginChannel(id: String?): Boolean = PluginChannels.clear(id)

    // https://stackoverflow.com/a/41560207
    // https://copyprogramming.com/howto/android-webview-savestate
    @JavascriptInterface
    @Synchronized
    fun dump() {
        check(!dumped) { "already dumped" }
        if (memoryStore.isEmpty()) {
            store.all?.forEach { (k, v) ->
                if (k != null && v is String) {
                    memoryStore[k] = v
                }
            }
        }
        val snapshot = memoryStore.entries.toList()
        val size = snapshot.size
        keys = arrayOfNulls(size)
        values = arrayOfNulls(size)
        for ((cur, entry) in snapshot.withIndex()) {
            keys!![cur] = entry.key
            values!![cur] = entry.value
        }
        dumped = true
    }

    @JavascriptInterface
    @Synchronized
    fun size(): Int {
        check(dumped) { "dump() first" }
        return keys!!.size
    }

    @JavascriptInterface
    @Synchronized
    fun key(i: Int): String? {
        check(dumped) { "dump() first" }
        return keys!![i]
    }

    @JavascriptInterface
    @Synchronized
    fun value(i: Int): String? {
        check(dumped) { "dump() first" }
        return values!![i]
    }

    @JavascriptInterface
    operator fun get(key: String?): String? {
        if (key == null) return null
        return memoryStore[key] ?: store.getString(key, null)?.also { memoryStore[key] = it }
    }

    @JavascriptInterface
    @Synchronized
    operator fun set(key: String?, value: String?) {
        check(!dumped) { "already dumped" }
        if (key != null) {
            if (value != null) {
                memoryStore[key] = value
            } else {
                memoryStore.remove(key)
            }
        }
        store.edit { putString(key, value) }
    }

    @JavascriptInterface
    @Synchronized
    fun clear() {
        memoryStore.clear()
        store.edit { clear() }
        keys = null
        values = null
        dumped = false
    }

    @Synchronized
    override fun toString(): String {
        return store.all.toString()
    }

    private fun injectLampaClientHeaders(url: String, headers: JSONObject) {
        try {
            if (!AppAttestation.shouldInjectClientHeaders(url, MainActivity.LAMPA_URL)) return

            AppAttestation.buildClientHeaders(mainActivity).forEach { (key, value) ->
                headers.putIfAbsentIgnoreCase(key, value)
            }

            val referer = MainActivity.LAMPA_URL.trim().trimEnd('/')
            if (referer.isNotEmpty()) {
                headers.putIfAbsentIgnoreCase("Referer", referer)
            }

            debugLog(
                TAG,
                "httpReq injected client headers: " +
                    "${AppAttestation.HEADER_CLIENT}=${AppAttestation.clientId()}, " +
                    "${AppAttestation.HEADER_REPO}=${BuildConfig.REPO_ID}, " +
                    "Referer=$referer, " +
                    "${AppAttestation.HEADER_CERT_SHA256}=${AppAttestation.signingCertSha256(mainActivity)}"
            )
        } catch (_: Throwable) {
        }
    }

    private fun JSONObject.putIfAbsentIgnoreCase(key: String, value: Any) {
        if (hasIgnoreCase(key)) return
        putSafe(key, value)
    }

    private fun JSONObject.hasIgnoreCase(key: String): Boolean {
        val needle = key.lowercase(Locale.ROOT)
        val it = keys()
        while (it.hasNext()) {
            if (it.next().lowercase(Locale.ROOT) == needle) return true
        }
        return false
    }

    private fun JSONObject.putSafe(key: String, value: Any) = try {
        put(key, value)
    } catch (_: JSONException) { /* Ignore */
    }
}
