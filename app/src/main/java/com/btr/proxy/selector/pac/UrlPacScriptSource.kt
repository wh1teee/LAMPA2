package com.btr.proxy.selector.pac

import android.util.Log
import okhttp3.Request
import top.rootu.lampa.net.HttpHelper
import java.io.File
import java.io.IOException
import java.net.Proxy
import java.net.URI
import java.util.concurrent.TimeUnit

class UrlPacScriptSource(private val scriptUrl: String) : PacScriptSource {

    @Volatile
    private var scriptContent: String? = null

    @Volatile
    private var expireAtMillis: Long = 0L

    @Synchronized
    @Throws(IOException::class)
    override fun getScriptContent(): String {
        val currentContent = scriptContent
        val now = System.currentTimeMillis()
        if (currentContent == null || (expireAtMillis > 0 && expireAtMillis < now)) {
            try {
                scriptContent = if (scriptUrl.startsWith("file:/") || !scriptUrl.contains(":/")) {
                    readPacFileContent(scriptUrl)
                } else {
                    downloadPacContent(scriptUrl)
                }
            } catch (e: IOException) {
                Log.e(TAG, "Loading script failed.", e)
                scriptContent = ""
                throw e
            }
        }
        return scriptContent.orEmpty()
    }

    @Throws(IOException::class)
    private fun readPacFileContent(url: String): String {
        return try {
            val file = if (!url.contains(":/")) {
                File(url)
            } else {
                File(URI(url))
            }
            file.readText()
        } catch (e: Exception) {
            Log.e(TAG, "File reading error.", e)
            throw IOException(e.message, e)
        }
    }

    @Throws(IOException::class)
    private fun downloadPacContent(url: String): String {
        val directClient = HttpHelper.client.newBuilder()
            .proxy(Proxy.NO_PROXY)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()

        val request = Request.Builder()
            .url(url)
            .header("User-Agent", HttpHelper.userAgent)
            .header("Accept", "application/x-ns-proxy-autoconfig, */*;q=0.8")
            .build()

        directClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Server returned: ${response.code} ${response.message}")
            }

            val maxAgeSeconds = response.cacheControl.maxAgeSeconds
            expireAtMillis = if (maxAgeSeconds > 0) {
                System.currentTimeMillis() + maxAgeSeconds * 1000L
            } else {
                System.currentTimeMillis() + DEFAULT_CACHE_TTL_MS
            }

            return response.body.string()
        }
    }

    override fun toString(): String = scriptUrl

    companion object {
        private const val TAG = "ProxyDroid.PAC"
        private const val DEFAULT_CACHE_TTL_MS = 10L * 60L * 1000L // 10 minutes
    }
}
