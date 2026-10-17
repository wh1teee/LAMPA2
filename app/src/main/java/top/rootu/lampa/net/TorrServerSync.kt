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
    private val URL_BASE_REGEX = Regex("""^(https?://)(?:[^/@?#]+@)?([^/?#]+)(/[^?#]*)?(?:\?([^#]*))?""", RegexOption.IGNORE_CASE)
    private val PLAY_PATH_REGEX = Regex("""^/play/([^/]+)/(\d+)""", RegexOption.IGNORE_CASE)
    private val TRANSIENT_FLAGS_REGEX = Regex("""([?&])(play|preload|stat)(?:=[^&]*)?(?=&|$)""", RegexOption.IGNORE_CASE)
    private val USER_INFO_REGEX = Regex("""^(https?://)[^/@?#]+@""", RegexOption.IGNORE_CASE)
    private val preloadedKeys = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()
    private var prefetchJob: kotlinx.coroutines.Job? = null

    data class TorrServerRef(
        val baseUrl: String,
        val hash: String,
        val fileIndex: Int
    )

    /**
     * Extracts `(baseUrl, hash, fileIndex)` if [url] is a TorrServer stream URL.
     * Transparently strips any embedded `user:pass@` userInfo from [baseUrl].
     */
    fun extractRef(url: String?): TorrServerRef? {
        if (url.isNullOrBlank()) return null
        val trimmed = url.trim()
        val match = URL_BASE_REGEX.find(trimmed) ?: return null
        val baseUrl = match.groupValues[1] + match.groupValues[2]
        val path = match.groupValues[3]
        val query = match.groupValues[4]

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
     * Checks whether [url] belongs to the user's configured TorrServer instance or a local TorrServer.
     */
    @JvmStatic
    fun isTorrServerUrl(url: String?): Boolean {
        if (url.isNullOrBlank()) return false
        if (extractRef(url) != null) return true
        val match = URL_BASE_REGEX.find(url.trim()) ?: return false
        val hostPort = match.groupValues[2]
        val host = hostPort.substringBefore(':').lowercase(Locale.ROOT)
        if (host == "127.0.0.1" || host == "localhost") return true

        val configuredRaw = top.rootu.lampa.AndroidJS.torrserverUrl.trim()
        if (configuredRaw.isNotEmpty()) {
            val withScheme = if (configuredRaw.contains("://")) configuredRaw else "http://$configuredRaw"
            val cfgHost = URL_BASE_REGEX.find(withScheme)?.groupValues?.get(2)
                ?.substringBefore(':')?.lowercase(Locale.ROOT)
            if (!cfgHost.isNullOrEmpty() && host == cfgHost) return true
        }
        return false
    }

    /**
     * Returns `Basic <base64>` header value if TorrServer authentication is enabled in Lampa.Storage.
     */
    @JvmStatic
    fun basicAuthHeaderValue(): String? {
        if (!top.rootu.lampa.AndroidJS.torrserverAuth) return null
        val login = top.rootu.lampa.AndroidJS.torrserverLogin
        if (login.isEmpty()) return null
        val pass = top.rootu.lampa.AndroidJS.torrserverPassword
        val encoded = java.util.Base64.getEncoder()
            .encodeToString("$login:$pass".toByteArray(StandardCharsets.UTF_8))
        return "Basic $encoded"
    }

    /**
     * Injects TorrServer Basic Auth credentials into the URL authority (`http://user:pass@host/...`)
     * for external players (such as MPV) that do not read HTTP headers from Android Intent extras.
     */
    @JvmStatic
    @JvmOverloads
    fun injectBasicAuthUrl(url: String?, headers: Array<String>? = null): String {
        if (url.isNullOrEmpty()) return ""
        if (USER_INFO_REGEX.containsMatchIn(url)) return url
        if (!isTorrServerUrl(url)) return url

        var login = if (top.rootu.lampa.AndroidJS.torrserverAuth) top.rootu.lampa.AndroidJS.torrserverLogin else ""
        var password = if (top.rootu.lampa.AndroidJS.torrserverAuth) top.rootu.lampa.AndroidJS.torrserverPassword else ""

        if (login.isEmpty() && headers != null) {
            var i = 0
            while (i + 1 < headers.size) {
                if (headers[i].equals("Authorization", ignoreCase = true)) {
                    val authVal = headers[i + 1].trim()
                    if (authVal.startsWith("Basic ", ignoreCase = true)) {
                        try {
                            val decoded = String(
                                java.util.Base64.getDecoder().decode(authVal.substring(6).trim()),
                                StandardCharsets.UTF_8
                            )
                            val colon = decoded.indexOf(':')
                            if (colon > 0) {
                                login = decoded.substring(0, colon)
                                password = decoded.substring(colon + 1)
                            }
                        } catch (_: Exception) {
                        }
                    }
                    break
                }
                i += 2
            }
        }
        if (login.isEmpty()) return url

        val user = URLEncoder.encode(login, StandardCharsets.UTF_8.name()).replace("+", "%20")
        val pass = URLEncoder.encode(password, StandardCharsets.UTF_8.name()).replace("+", "%20")
        return url.replaceFirst(Regex("""^(https?://)""", RegexOption.IGNORE_CASE), "$1$user:$pass@")
    }

    /**
     * Checks whether [urlA] and [urlB] refer to the same media stream, accounting for
     * TorrServer `(hash, index)` parameters, embedded `user:pass@` credentials, and URL encoding.
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
        val withoutUserInfo = USER_INFO_REGEX.replace(url.trim(), "$1")
        val stripped = TRANSIENT_FLAGS_REGEX.replace(withoutUserInfo) { m ->
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
     * Triggers non-blocking pre-warming (`&preload`) of an episode in TorrServer RAM cache.
     * Deduplicated per `(hash, fileIndex)` so repeated hover/card opens do not spam TorrServer.
     */
    fun preloadEpisodeAsync(url: String?, headers: Array<String>? = null) {
        val ref = extractRef(url) ?: return
        val key = "${ref.hash}:${ref.fileIndex}"
        if (preloadedKeys.size > 64) preloadedKeys.clear()
        if (!preloadedKeys.add(key)) return

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
                        "Preloaded episode in TorrServer [hash=${ref.hash}, index=${ref.fileIndex}, code=${response.code}]"
                    )
                }
            } catch (e: Exception) {
                preloadedKeys.remove(key)
                debugLog(TAG, "TorrServer preload skipped: ${e.message}")
            }
        }
    }

    /**
     * Debounced real-time prefetch triggered when a user focuses a stream item in Lampa UI
     * or opens a card that has a saved stream URL.
     */
    fun prefetchStreamHint(url: String?, headers: Array<String>? = null) {
        val candidate = url?.trim()?.takeIf { it.startsWith("http", ignoreCase = true) } ?: return
        prefetchJob?.cancel()
        prefetchJob = scope.launch {
            kotlinx.coroutines.delay(350L)
            if (extractRef(candidate) != null) {
                preloadEpisodeAsync(candidate, headers)
            } else {
                HttpHelper.preconnectAsync(candidate)
            }
        }
    }

    private fun applyAuthHeaders(builder: Request.Builder, headers: Array<String>?) {
        var hasAuth = false
        if (headers != null) {
            var i = 0
            while (i + 1 < headers.size) {
                val k = headers[i]
                val v = headers[i + 1]
                if (k.equals("Authorization", ignoreCase = true)) {
                    hasAuth = true
                    builder.header(k, v)
                } else if (k.equals("Cookie", ignoreCase = true) ||
                    k.equals("User-Agent", ignoreCase = true)
                ) {
                    builder.header(k, v)
                }
                i += 2
            }
        }
        if (!hasAuth) {
            basicAuthHeaderValue()?.let { builder.header("Authorization", it) }
        }
    }
}
