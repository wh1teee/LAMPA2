package top.rootu.lampa.net

import kotlinx.coroutines.launch
import okhttp3.Cache
import okhttp3.ConnectionPool
import okhttp3.ConnectionSpec
import okhttp3.Dispatcher
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.brotli.BrotliInterceptor
import top.rootu.lampa.App
import java.io.File
import java.util.concurrent.TimeUnit

object HttpHelper {

    const val DEFAULT_CONNECTION_TIMEOUT: Int = 15_000
    private const val HTTP_CACHE_SIZE_BYTES: Long = 20L * 1024L * 1024L // 20 MB

    /**
     * The 'User-Agent' name to send to the server
     */
    @JvmField
    var userAgent: String = "Mozilla/5.0"

    private val connectionSpecs: List<ConnectionSpec> = listOf(
        ConnectionSpec.CLEARTEXT,
        ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS)
            .allEnabledTlsVersions()
            .allEnabledCipherSuites()
            .build()
    )

    private val TMDB_HOSTS = setOf(
        "api.themoviedb.org",
        "image.tmdb.org",
        "www.themoviedb.org",
        "themoviedb.org"
    )

    // Ported from NUM (ru.yourok.num.app.OkHttpClientFactory & /num/biplist.txt + /num/wiplist.txt)
    private val BLOCKED_CLOUDFRONT_IPS = setOf(
        "13.224.161.90",
        "108.138.246.49",
        "143.204.98.68"
    )

    private val FALLBACK_CLOUDFRONT_IPS = listOf(
        "13.33.240.18",
        "13.33.240.55",
        "13.33.240.91",
        "13.33.240.123",
        "13.33.242.29",
        "13.33.242.59",
        "13.33.242.90",
        "13.33.242.106",
        "52.85.242.44",
        "65.9.44.54",
        "13.225.88.12",
        "13.225.88.53"
    )

    private val smartTmdbDns = object : okhttp3.Dns {
        override fun lookup(hostname: String): List<java.net.InetAddress> {
            val lowerHost = hostname.lowercase( java.util.Locale.ROOT)
            val isTmdb = lowerHost in TMDB_HOSTS
            val systemAddresses = try {
                okhttp3.Dns.SYSTEM.lookup(hostname)
            } catch (e: java.net.UnknownHostException) {
                if (!isTmdb) throw e
                emptyList()
            }
            if (!isTmdb) return systemAddresses

            val filtered = systemAddresses.filter { addr ->
                (addr.hostAddress ?: "") !in BLOCKED_CLOUDFRONT_IPS
            }
            val fallbackAddresses = FALLBACK_CLOUDFRONT_IPS.mapNotNull { ip ->
                runCatching {
                    val rawBytes = ip.split('.').map { it.toInt().toByte() }.toByteArray()
                    java.net.InetAddress.getByAddress(hostname, rawBytes)
                }.getOrNull()
            }
            return (filtered + fallbackAddresses).distinctBy { it.hostAddress ?: "" }.ifEmpty {
                okhttp3.Dns.SYSTEM.lookup(hostname)
            }
        }
    }

    /**
     * Shared singleton OkHttpClient with connection pooling, high-concurrency dispatcher,
     * Brotli + Gzip decompression, NUM CloudFront smart DNS, and 20 MB disk cache.
     */
    @JvmStatic
    val client: OkHttpClient by lazy {
        val dispatcher = Dispatcher().apply {
            maxRequests = 64
            maxRequestsPerHost = 16
        }
        val pool = ConnectionPool(16, 5, TimeUnit.MINUTES)
        val cache = runCatching {
            Cache(File(App.context.cacheDir, "okhttp_cache"), HTTP_CACHE_SIZE_BYTES)
        }.getOrNull()

        OkHttpClient.Builder()
            .dispatcher(dispatcher)
            .connectionPool(pool)
            .dns(smartTmdbDns)
            .apply { if (cache != null) cache(cache) }
            .addInterceptor(BrotliInterceptor)
            .connectionSpecs(connectionSpecs)
            .connectTimeout(DEFAULT_CONNECTION_TIMEOUT / 2L, TimeUnit.MILLISECONDS)
            .readTimeout(DEFAULT_CONNECTION_TIMEOUT.toLong(), TimeUnit.MILLISECONDS)
            .writeTimeout(DEFAULT_CONNECTION_TIMEOUT.toLong(), TimeUnit.MILLISECONDS)
            .callTimeout(DEFAULT_CONNECTION_TIMEOUT.toLong(), TimeUnit.MILLISECONDS)
            .build()
    }

    @JvmStatic
    @JvmOverloads
    fun getOkHttpClient(
        timeout: Int = DEFAULT_CONNECTION_TIMEOUT,
        disableH2: Boolean = Http.consumeDisableH2()
    ): OkHttpClient {
        val effectiveTimeout = if (timeout > 0) timeout else DEFAULT_CONNECTION_TIMEOUT
        val proxySelector = Http.getProxySelector()

        if (effectiveTimeout == DEFAULT_CONNECTION_TIMEOUT && !disableH2 && proxySelector == null) {
            return client
        }

        return client.newBuilder().apply {
            if (disableH2) {
                protocols(listOf(Protocol.HTTP_1_1))
            }
            if (effectiveTimeout != DEFAULT_CONNECTION_TIMEOUT) {
                val timeoutMs = effectiveTimeout.toLong()
                connectTimeout(timeoutMs / 2L, TimeUnit.MILLISECONDS)
                readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                writeTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            }
            if (proxySelector != null) {
                proxySelector(proxySelector)
            }
        }.build()
    }

    private val preconnectScope = kotlinx.coroutines.CoroutineScope(
        kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.IO
    )
    private val preconnectedHosts = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()

    /**
     * Asynchronously warms up DNS resolution and TCP/TLS connection pool for the given URLs
     * so subsequent requests from Lampa WebView or native bridge experience zero handshake latency.
     */
    @JvmStatic
    fun preconnectAsync(vararg urls: String?) {
        for (raw in urls) {
            val trimmed = raw?.trim()?.takeIf { it.startsWith("http", ignoreCase = true) } ?: continue
            val origin = runCatching {
                val u = java.net.URI(trimmed)
                val scheme = u.scheme?.lowercase() ?: return@runCatching null
                val host = u.host?.lowercase() ?: return@runCatching null
                val port = if (u.port != -1) ":${u.port}" else ""
                "$scheme://$host$port"
            }.getOrNull() ?: continue

            if (!preconnectedHosts.add(origin)) continue
            preconnectScope.launch {
                runCatching {
                    val req = okhttp3.Request.Builder()
                        .url(origin)
                        .head()
                        .header("User-Agent", userAgent)
                        .build()
                    client.newCall(req).execute().close()
                }
            }
        }
    }
}
