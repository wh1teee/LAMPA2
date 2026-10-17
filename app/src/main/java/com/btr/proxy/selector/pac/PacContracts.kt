package com.btr.proxy.selector.pac

import java.io.IOException

open class ProxyException : Exception {
    constructor() : super()
    constructor(message: String?, cause: Throwable?) : super(message, cause)
    constructor(message: String?) : super(message)
    constructor(cause: Throwable?) : super(cause)
}

class ProxyEvaluationException : ProxyException {
    constructor() : super()
    constructor(message: String?, cause: Throwable?) : super(message, cause)
    constructor(message: String?) : super(message)
    constructor(cause: Throwable?) : super(cause)
}

class Proxy(
    @JvmField var host: String? = "",
    @JvmField var port: Int = 3128,
    @JvmField var type: String? = TYPE_HTTP
) {
    companion object {
        @JvmField
        val NO_PROXY = Proxy(null, 0, null)

        const val TYPE_HTTP = "http"
        const val TYPE_HTTPS = "https"
        const val TYPE_SOCKS4 = "socks4"
        const val TYPE_SOCKS5 = "socks5"
    }
}

interface PacScriptSource {
    @Throws(IOException::class)
    fun getScriptContent(): String
}

interface PacScriptParser {
    val scriptSource: PacScriptSource

    @Throws(ProxyEvaluationException::class)
    fun evaluate(url: String, host: String): String
}

interface ScriptMethods {
    fun isPlainHostName(host: String): Boolean
    fun dnsDomainIs(host: String, domain: String): Boolean
    fun localHostOrDomainIs(host: String, domain: String): Boolean
    fun isResolvable(host: String): Boolean
    fun isResolvableEx(host: String): Boolean
    fun isInNet(host: String, pattern: String, mask: String): Boolean
    fun isInNetEx(ipAddress: String, ipPrefix: String): Boolean
    fun dnsResolve(host: String): String
    fun dnsResolveEx(host: String): String
    fun myIpAddress(): String
    fun myIpAddressEx(): String
    fun dnsDomainLevels(host: String): Int
    fun shExpMatch(str: String, shexp: String): Boolean
    fun weekdayRange(wd1: String?, wd2: String?, gmt: String?): Boolean
    fun dateRange(
        day1: Any?,
        month1: Any?,
        year1: Any?,
        day2: Any?,
        month2: Any?,
        year2: Any?,
        gmt: Any?
    ): Boolean

    fun timeRange(
        hour1: Any?,
        min1: Any?,
        sec1: Any?,
        hour2: Any?,
        min2: Any?,
        sec2: Any?,
        gmt: Any?
    ): Boolean

    fun sortIpAddressList(ipAddressList: String?): String
    val clientVersion: String
}
