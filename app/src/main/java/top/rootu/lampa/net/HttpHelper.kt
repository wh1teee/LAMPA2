package top.rootu.lampa.net

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

    /**
     * Shared singleton OkHttpClient with connection pooling, high-concurrency dispatcher,
     * Brotli + Gzip decompression, and 20 MB disk cache.
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
}
