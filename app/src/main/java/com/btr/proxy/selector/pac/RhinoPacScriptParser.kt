package com.btr.proxy.selector.pac

import android.util.Log
import org.mozilla.javascript.Context
import org.mozilla.javascript.Function
import org.mozilla.javascript.Scriptable
import org.mozilla.javascript.ScriptableObject
import java.util.Calendar

class RhinoPacScriptParser @Throws(ProxyEvaluationException::class) constructor(
    override val scriptSource: PacScriptSource
) : ScriptableObject(), PacScriptParser {

    private lateinit var scope: Scriptable
    private var loadedScriptContent: String? = null
    private var findProxyFunction: Function? = null
    private val evalLock = Any()

    init {
        setupEngine()
    }

    @Throws(ProxyEvaluationException::class)
    fun setupEngine() {
        val context = Context.enter()
        context.isInterpretedMode = true
        try {
            defineFunctionProperties(
                JS_FUNCTION_NAMES,
                RhinoPacScriptParser::class.java,
                DONTENUM
            )
            this.scope = context.initStandardObjects(this)
        } catch (e: Exception) {
            Log.e(TAG, "JS Engine setup error.", e)
            throw ProxyEvaluationException(e.message, e)
        } finally {
            Context.exit()
        }
    }

    @Throws(ProxyEvaluationException::class)
    override fun evaluate(url: String, host: String): String {
        val scriptContent = try {
            scriptSource.getScriptContent()
        } catch (e: Exception) {
            throw ProxyEvaluationException("Failed to fetch PAC script: ${e.message}", e)
        }

        synchronized(evalLock) {
            val context = Context.enter()
            context.isInterpretedMode = true
            try {
                if (scriptContent !== loadedScriptContent && scriptContent != loadedScriptContent) {
                    context.evaluateString(scope, scriptContent, "userPacFile", 1, null)
                    val fnObj = scope.get("FindProxyForURL", scope)
                    findProxyFunction = fnObj as? Function
                        ?: throw ProxyEvaluationException("FindProxyForURL function not defined in PAC script")
                    loadedScriptContent = scriptContent
                }

                val fn = findProxyFunction
                    ?: throw ProxyEvaluationException("FindProxyForURL is null")
                val result = fn.call(context, scope, scope, arrayOf<Any>(url, host))
                return Context.toString(result)
            } catch (e: ProxyEvaluationException) {
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "JS evaluation error.", e)
                throw ProxyEvaluationException("Error while executing PAC script: ${e.message}", e)
            } finally {
                Context.exit()
            }
        }
    }

    override fun getClassName(): String = RhinoPacScriptParser::class.java.simpleName

    companion object {
        private const val serialVersionUID = 1L
        private const val TAG = "ProxyDroid.PAC"

        private val JS_FUNCTION_NAMES = arrayOf(
            "shExpMatch",
            "dnsResolve",
            "isResolvable",
            "isInNet",
            "dnsDomainIs",
            "isPlainHostName",
            "myIpAddress",
            "dnsDomainLevels",
            "localHostOrDomainIs",
            "weekdayRange",
            "dateRange",
            "timeRange"
        )

        private val SCRIPT_METHODS = PacScriptMethods()

        @JvmStatic
        fun isPlainHostName(host: String): Boolean = SCRIPT_METHODS.isPlainHostName(host)

        @JvmStatic
        fun dnsDomainIs(host: String, domain: String): Boolean =
            SCRIPT_METHODS.dnsDomainIs(host, domain)

        @JvmStatic
        fun localHostOrDomainIs(host: String, domain: String): Boolean =
            SCRIPT_METHODS.localHostOrDomainIs(host, domain)

        @JvmStatic
        fun isResolvable(host: String): Boolean = SCRIPT_METHODS.isResolvable(host)

        @JvmStatic
        fun isInNet(host: String, pattern: String, mask: String): Boolean =
            SCRIPT_METHODS.isInNet(host, pattern, mask)

        @JvmStatic
        fun dnsResolve(host: String): String = SCRIPT_METHODS.dnsResolve(host)

        @JvmStatic
        fun myIpAddress(): String = SCRIPT_METHODS.myIpAddress()

        @JvmStatic
        fun dnsDomainLevels(host: String): Int = SCRIPT_METHODS.dnsDomainLevels(host)

        @JvmStatic
        fun shExpMatch(str: String, shexp: String): Boolean =
            SCRIPT_METHODS.shExpMatch(str, shexp)

        @JvmStatic
        fun weekdayRange(wd1: String?, wd2: String?, gmt: String?): Boolean =
            SCRIPT_METHODS.weekdayRange(wd1, wd2, gmt)

        @JvmStatic
        internal fun setCurrentTime(cal: Calendar?) {
            SCRIPT_METHODS.setCurrentTime(cal)
        }

        @JvmStatic
        fun dateRange(
            day1: Any?,
            month1: Any?,
            year1: Any?,
            day2: Any?,
            month2: Any?,
            year2: Any?,
            gmt: Any?
        ): Boolean = SCRIPT_METHODS.dateRange(day1, month1, year1, day2, month2, year2, gmt)

        @JvmStatic
        fun timeRange(
            hour1: Any?,
            min1: Any?,
            sec1: Any?,
            hour2: Any?,
            min2: Any?,
            sec2: Any?,
            gmt: Any?
        ): Boolean = SCRIPT_METHODS.timeRange(hour1, min1, sec1, hour2, min2, sec2, gmt)
    }
}
