package net.gotev.speech

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.speech.SpeechRecognizer
import android.util.Log
import top.rootu.lampa.BuildConfig

interface SpeechDelegate {
    fun onStartOfSpeech()
    fun onSpeechRmsChanged(value: Float)
    fun onSpeechPartialResults(results: List<String>)
    fun onSpeechResult(result: String)
}

class SpeechRecognitionNotAvailable : Exception("Speech recognition not available")

class GoogleVoiceTypingDisabledException : Exception("Google voice typing must be enabled")

class SpeechRecognitionException(val code: Int) : Exception(getMessage(code)) {
    companion object {
        private fun getMessage(code: Int): String = when (code) {
            SpeechRecognizer.ERROR_AUDIO -> "$code - Audio recording error"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                "$code - Insufficient permissions. Request android.permission.RECORD_AUDIO"
            SpeechRecognizer.ERROR_CLIENT ->
                "$code - Client side error. Maybe your internet connection is poor!"
            SpeechRecognizer.ERROR_NETWORK -> "$code - Network error"
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "$code - Network operation timed out"
            SpeechRecognizer.ERROR_NO_MATCH ->
                "$code - No recognition result matched. Try turning on partial results as a workaround."
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "$code - RecognitionService busy"
            SpeechRecognizer.ERROR_SERVER -> "$code - Server sends error status"
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "$code - No speech input"
            else -> "$code - Unknown exception"
        }
    }
}

object SpeechUtil {
    @JvmStatic
    fun redirectUserToGoogleAppOnPlayStore(context: Context) {
        context.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setData(Uri.parse("market://details?id=${Speech.GOOGLE_APP_PACKAGE}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}

object Logger {
    enum class LogLevel {
        DEBUG,
        INFO,
        ERROR,
        OFF
    }

    interface LoggerDelegate {
        fun error(tag: String, message: String)
        fun error(tag: String, message: String, exception: Throwable)
        fun debug(tag: String, message: String)
        fun info(tag: String, message: String)
    }

    private class DefaultLoggerDelegate : LoggerDelegate {
        override fun error(tag: String, message: String) {
            Log.e(tag, message)
        }

        override fun error(tag: String, message: String, exception: Throwable) {
            Log.e(tag, message, exception)
        }

        override fun debug(tag: String, message: String) {
            Log.d(tag, message)
        }

        override fun info(tag: String, message: String) {
            Log.i(tag, message)
        }
    }

    @Volatile
    private var logLevel: LogLevel = if (BuildConfig.DEBUG) LogLevel.DEBUG else LogLevel.OFF

    @Volatile
    private var delegate: LoggerDelegate = DefaultLoggerDelegate()

    @JvmStatic
    fun resetLoggerDelegate() {
        delegate = DefaultLoggerDelegate()
    }

    @JvmStatic
    fun setLoggerDelegate(newDelegate: LoggerDelegate) {
        delegate = newDelegate
    }

    @JvmStatic
    fun setLogLevel(level: LogLevel) {
        logLevel = level
    }

    @JvmStatic
    fun error(tag: String, message: String) {
        if (logLevel <= LogLevel.ERROR) {
            delegate.error(tag, message)
        }
    }

    @JvmStatic
    fun error(tag: String, message: String, exception: Throwable) {
        if (logLevel <= LogLevel.ERROR) {
            delegate.error(tag, message, exception)
        }
    }

    @JvmStatic
    fun info(tag: String, message: String) {
        if (logLevel <= LogLevel.INFO) {
            delegate.info(tag, message)
        }
    }

    @JvmStatic
    fun debug(tag: String, message: String) {
        if (logLevel <= LogLevel.DEBUG) {
            delegate.debug(tag, message)
        }
    }
}

class DelayedOperation(
    context: Context,
    private val tag: String,
    private val delayInMilliseconds: Long
) {
    interface Operation {
        fun onDelayedOperation()
        fun shouldExecuteDelayedOperation(): Boolean
    }

    private val mainHandler = Handler(context.mainLooper ?: Looper.getMainLooper())
    private var operation: Operation? = null
    private var started = false

    private val timeoutRunnable = Runnable {
        val op = operation
        if (op != null && op.shouldExecuteDelayedOperation()) {
            Logger.debug(LOG_TAG, "executing delayed operation with tag: $tag")
            op.onDelayedOperation()
        }
        started = false
    }

    init {
        require(delayInMilliseconds > 0) { "The delay in milliseconds must be > 0" }
        Logger.debug(LOG_TAG, "created delayed operation with tag: $tag")
    }

    fun start(op: Operation) {
        Logger.debug(LOG_TAG, "starting delayed operation with tag: $tag")
        operation = op
        cancel()
        started = true
        resetTimer()
    }

    fun resetTimer() {
        if (!started) return
        Logger.debug(LOG_TAG, "resetting delayed operation with tag: $tag")
        mainHandler.removeCallbacks(timeoutRunnable)
        mainHandler.postDelayed(timeoutRunnable, delayInMilliseconds)
    }

    fun cancel() {
        if (started) {
            Logger.debug(LOG_TAG, "cancelled delayed operation with tag: $tag")
            mainHandler.removeCallbacks(timeoutRunnable)
            started = false
        }
    }

    companion object {
        private const val LOG_TAG = "DelayedOperation"
    }
}
