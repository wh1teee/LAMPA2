package com.btr.proxy.selector.pac

import android.util.Log
import android.util.LruCache
import java.io.IOException
import java.net.InetSocketAddress
import java.net.ProxySelector
import java.net.SocketAddress
import java.net.URI
import java.util.Locale

class PacProxySelector(pacSource: PacScriptSource) : ProxySelector() {

    private var pacScriptParser: PacScriptParser? = null
    private val hostProxyCache = LruCache<String, List<java.net.Proxy>>(512)

    init {
        selectEngine(pacSource)
    }

    private fun selectEngine(pacSource: PacScriptSource) {
        try {
            this.pacScriptParser = RhinoPacScriptParser(pacSource)
        } catch (e: Exception) {
            Log.e(TAG, "PAC parser error.", e)
        }
    }

    override fun select(uri: URI?): List<java.net.Proxy> {
        val targetUri = uri ?: throw IllegalArgumentException("URI must not be null.")
        val host = targetUri.host ?: throw IllegalArgumentException("Host must not be null.")

        val parser = pacScriptParser ?: return DIRECT_PROXY_LIST

        // Prevent infinite loop when fetching the PAC file itself
        if (parser.scriptSource.toString().contains(host, ignoreCase = true)) {
            return DIRECT_PROXY_LIST
        }

        val cacheKey = "${targetUri.scheme ?: "http"}://$host:${targetUri.port}"
        synchronized(hostProxyCache) {
            hostProxyCache.get(cacheKey)?.let { return it }
        }

        val resolved = findProxy(parser, targetUri, host)
        synchronized(hostProxyCache) {
            hostProxyCache.put(cacheKey, resolved)
        }
        return resolved
    }

    override fun connectFailed(uri: URI?, sa: SocketAddress?, ioe: IOException?) {
        if (uri?.host != null) {
            val cacheKey = "${uri.scheme ?: "http"}://${uri.host}:${uri.port}"
            synchronized(hostProxyCache) {
                hostProxyCache.remove(cacheKey)
            }
        }
    }

    private fun findProxy(
        parser: PacScriptParser,
        uri: URI,
        host: String
    ): List<java.net.Proxy> {
        return try {
            val proxies = mutableListOf<java.net.Proxy>()
            val parseResult = parser.evaluate(uri.toString(), host)
            val proxyDefinitions = parseResult.split(";")
            for (proxyDef in proxyDefinitions) {
                val trimmed = proxyDef.trim()
                if (trimmed.isNotEmpty()) {
                    proxies.add(buildProxyFromPacResult(trimmed))
                }
            }
            if (proxies.isEmpty()) DIRECT_PROXY_LIST else proxies
        } catch (e: ProxyEvaluationException) {
            Log.e(TAG, "PAC resolving error.", e)
            DIRECT_PROXY_LIST
        }
    }

    private fun buildProxyFromPacResult(pacResult: String?): java.net.Proxy {
        if (pacResult == null || pacResult.trim().length < 6) {
            return java.net.Proxy.NO_PROXY
        }
        val proxyDef = pacResult.trim()
        val upper = proxyDef.uppercase(Locale.ROOT)
        if (upper.startsWith(PAC_DIRECT)) {
            return java.net.Proxy.NO_PROXY
        }

        val type = when {
            upper.startsWith(PAC_SOCKS) -> Proxy.TYPE_SOCKS5
            upper.startsWith(PAC_HTTPS) -> Proxy.TYPE_HTTPS
            else -> Proxy.TYPE_HTTP
        }

        var host = proxyDef.substring(6).trim()
        var port = if (type == Proxy.TYPE_HTTPS) 443 else 80

        val indexOfPort = host.lastIndexOf(':')
        if (indexOfPort != -1) {
            port = host.substring(indexOfPort + 1).trim().toIntOrNull() ?: port
            host = host.substring(0, indexOfPort).trim()
        }

        val pType = if (type == Proxy.TYPE_SOCKS5) {
            java.net.Proxy.Type.SOCKS
        } else {
            java.net.Proxy.Type.HTTP
        }
        return java.net.Proxy(pType, InetSocketAddress.createUnresolved(host, port))
    }

    companion object {
        private const val PAC_SOCKS = "SOCKS"
        private const val PAC_DIRECT = "DIRECT"
        private const val PAC_HTTPS = "HTTPS"
        private const val TAG = "ProxyDroid.PAC"
        private val DIRECT_PROXY_LIST = listOf(java.net.Proxy.NO_PROXY)
    }
}
