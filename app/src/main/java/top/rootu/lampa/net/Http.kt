package top.rootu.lampa.net

import android.util.Base64
import com.btr.proxy.selector.pac.PacProxySelector
import com.btr.proxy.selector.pac.UrlPacScriptSource
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import top.rootu.lampa.helpers.Helpers.debugLog
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

class Http(private val disableH2ForCall: Boolean = consumeDisableH2()) {

    var lastErrorCode: Int = 0
        private set

    private fun getReqBuilder(method: String, url: String, headers: JSONObject?): Request.Builder {
        debugLog("LampaHttp.RB", "$method $url")
        var ua = HttpHelper.userAgent
        val rb = Request.Builder().url(url)
        if (headers != null) {
            val keys = headers.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = headers.optString(key)
                when (key.lowercase(Locale.ROOT)) {
                    "user-agent" -> ua = value
                    "content-length" -> Unit
                    else -> rb.header(key, value)
                }
            }
        }
        rb.header("User-Agent", ua)
        return rb
    }

    private fun getJsonFromResponse(response: Response, dataType: String?): JSONObject {
        response.use { resp ->
            if (!resp.isSuccessful) {
                this.lastErrorCode = resp.code
                throw Exception("Invalid response from server: ${resp.code} ${resp.message}")
            }

            val rh = resp.headers
            val jsonHeaders = JSONObject()
            for (i in 0 until rh.size) {
                val hName = rh.name(i).lowercase(Locale.ROOT)
                val hVal = rh.value(i)
                when {
                    hName == "set-cookie" -> {
                        val hValues = jsonHeaders.optJSONArray(hName) ?: JSONArray().also {
                            jsonHeaders.put(hName, it)
                        }
                        hValues.put(hVal)
                    }
                    jsonHeaders.has(hName) -> {
                        val existing = jsonHeaders.optString(hName, "")
                        jsonHeaders.put(hName, "$existing, $hVal")
                    }
                    else -> jsonHeaders.put(hName, hVal)
                }
            }

            val body = resp.body
            val json = JSONObject()
            try {
                json.put("headers", jsonHeaders)
                json.put("currentUrl", resp.request.url.toString())

                val declaredLength = body.contentLength()
                val source = body.source()
                // Guard against both declared > 2MB and chunked/compressed streams > 2MB
                val exceedsLimit = declaredLength > MAX_ALLOWED_BODY_SIZE ||
                    source.request(MAX_ALLOWED_BODY_SIZE + 1)

                if (exceedsLimit) {
                    json.put("body", "[Response too large, skipped]")
                } else if ("base64".equals(dataType, ignoreCase = true)) {
                    json.put("body", Base64.encodeToString(body.bytes(), Base64.NO_WRAP))
                    json.put("encoding", "base64")
                } else if (source.request(2) &&
                    source.buffer[0] == 0x1f.toByte() &&
                    source.buffer[1] == 0x8b.toByte()
                ) {
                    val text = java.util.zip.GZIPInputStream(body.byteStream())
                        .bufferedReader(Charsets.UTF_8)
                        .use { it.readText() }
                    json.put("body", text)
                } else {
                    json.put("body", body.string())
                }
            } catch (e: JSONException) {
                e.printStackTrace()
            }
            return json
        }
    }

    @JvmOverloads
    @Throws(Exception::class)
    fun Send(
        method: String,
        url: String,
        data: String = "",
        headers: JSONObject? = null,
        timeout: Int,
        dataType: String? = null
    ): JSONObject {
        if (!url.lowercase(Locale.ROOT).startsWith("http")) {
            this.lastErrorCode = 400
            throw Exception("Bad Request (Invalid protocol; use http or https)")
        }
        val normalizedMethod = method.uppercase(Locale.ROOT).ifEmpty {
            if (data.isEmpty()) "GET" else "POST"
        }
        val rb = getReqBuilder(normalizedMethod, url, headers)
        val requestBody = if (
            normalizedMethod != "GET" &&
            normalizedMethod != "HEAD" &&
            (data.isNotEmpty() || normalizedMethod == "POST" || normalizedMethod == "PUT" || normalizedMethod == "PATCH")
        ) {
            val mediaType = if (data.isEmpty()) {
                null
            } else {
                (headers?.optString("Content-Type", "application/x-www-form-urlencoded")
                    ?: "application/x-www-form-urlencoded").toMediaTypeOrNull()
            }
            data.toRequestBody(mediaType)
        } else {
            null
        }
        rb.method(normalizedMethod, requestBody)
        val client = HttpHelper.getOkHttpClient(timeout, disableH2ForCall)
        val response = client.newCall(rb.build()).execute()
        return getJsonFromResponse(response, dataType)
    }

    @JvmOverloads
    @Throws(Exception::class)
    fun Get(
        url: String,
        headers: JSONObject?,
        timeout: Int,
        dataType: String? = null
    ): JSONObject = Send("GET", url, "", headers, timeout, dataType)

    @JvmOverloads
    @Throws(Exception::class)
    fun Post(
        url: String,
        data: String,
        headers: JSONObject?,
        timeout: Int,
        dataType: String? = null
    ): JSONObject = Send("POST", url, data, headers, timeout, dataType)

    companion object {
        private const val MAX_ALLOWED_BODY_SIZE: Long = 2L * 1024L * 1024L // 2 MB

        @Volatile
        private var pacUrl: String = ""

        @Volatile
        private var ps: PacProxySelector? = null

        private val disableH2Flag = AtomicBoolean(false)

        @JvmStatic
        @Synchronized
        fun getProxySelector(): PacProxySelector? {
            if (ps == null && pacUrl.isNotEmpty()) {
                ps = PacProxySelector(UrlPacScriptSource(pacUrl))
            }
            return ps
        }

        @JvmStatic
        @Synchronized
        fun setProxyPAC(url: String): Boolean {
            if (pacUrl.isEmpty() || !url.equals(pacUrl, ignoreCase = true)) {
                pacUrl = url
                ps = null
            }
            return true
        }

        @JvmStatic
        fun getProxyPAC(): String = pacUrl

        @JvmStatic
        fun disableH2(bool: Boolean) {
            disableH2Flag.set(bool)
        }

        @JvmStatic
        fun isDisableH2(): Boolean = disableH2Flag.get()

        @JvmStatic
        fun consumeDisableH2(): Boolean = disableH2Flag.getAndSet(false)
    }
}
