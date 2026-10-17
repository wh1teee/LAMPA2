package net.gotev.speech

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.widget.LinearLayout
import net.gotev.speech.ui.SpeechProgressView
import java.util.Locale

interface SpeechRecognitionEngine : RecognitionListener {
    fun init(context: Context)
    fun clear()
    fun getPartialResultsAsString(): String
    fun initSpeechRecognizer(context: Context)

    @Throws(SpeechRecognitionNotAvailable::class, GoogleVoiceTypingDisabledException::class)
    fun startListening(progressView: SpeechProgressView?, delegate: SpeechDelegate)

    fun stopListening()
    fun returnPartialResultsAndRecreateSpeechRecognizer()
    fun setPartialResults(getPartialResults: Boolean)
    fun shutdown()
    val isListening: Boolean
    var locale: Locale
    fun setPreferOffline(preferOffline: Boolean)
    fun setTransitionMinimumDelay(milliseconds: Long)
    fun setStopListeningAfterInactivity(milliseconds: Long)
    fun setCallingPackage(callingPackage: String?)
    fun unregisterDelegate()
}

class BaseSpeechRecognitionEngine : SpeechRecognitionEngine {

    private var context: Context? = null
    private var speechRecognizer: SpeechRecognizer? = null
    private var delegate: SpeechDelegate? = null
    private var progressView: SpeechProgressView? = null
    private var callingPackage: String? = null

    private var unstableData: String? = null
    private var delayedStopListening: DelayedOperation? = null
    private val partialData = mutableListOf<String>()
    private var lastPartialResults: List<String>? = null

    override var locale: Locale = Locale.getDefault()
    private var preferOffline: Boolean = false
    private var getPartialResults: Boolean = true
    override var isListening: Boolean = false
        private set

    private var lastActionTimestamp: Long = 0L
    private var stopListeningDelayInMs: Long = 4000L
    private var transitionMinimumDelay: Long = 1200L

    override fun init(context: Context) {
        initDelayedStopListening(context)
    }

    override fun clear() {
        partialData.clear()
        unstableData = null
    }

    override fun onReadyForSpeech(bundle: Bundle?) {
        partialData.clear()
        unstableData = null
    }

    override fun onBeginningOfSpeech() {
        progressView?.onBeginningOfSpeech()
        delayedStopListening?.start(object : DelayedOperation.Operation {
            override fun onDelayedOperation() {
                returnPartialResultsAndRecreateSpeechRecognizer()
            }

            override fun shouldExecuteDelayedOperation(): Boolean = true
        })
    }

    override fun onRmsChanged(v: Float) {
        try {
            delegate?.onSpeechRmsChanged(v)
        } catch (exc: Throwable) {
            Logger.error(LOG_TAG, "Unhandled exception in delegate onSpeechRmsChanged", exc)
        }
        progressView?.onRmsChanged(v)
    }

    override fun onPartialResults(bundle: Bundle?) {
        delayedStopListening?.resetTimer()
        if (bundle == null) return

        val partialResults = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        val unstable = bundle.getStringArrayList("android.speech.extra.UNSTABLE_TEXT")

        if (!partialResults.isNullOrEmpty()) {
            partialData.clear()
            partialData.addAll(partialResults)
            unstableData = unstable?.firstOrNull()
            try {
                if (lastPartialResults != partialResults) {
                    delegate?.onSpeechPartialResults(partialResults)
                    lastPartialResults = partialResults
                }
            } catch (exc: Throwable) {
                Logger.error(LOG_TAG, "Unhandled exception in delegate onSpeechPartialResults", exc)
            }
        }
    }

    override fun onResults(bundle: Bundle?) {
        delayedStopListening?.cancel()
        val results = bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)

        val result = if (!results.isNullOrEmpty() && !results[0].isNullOrEmpty()) {
            results[0]
        } else {
            Logger.info(LOG_TAG, "No speech results, getting partial")
            getPartialResultsAsString()
        }

        isListening = false

        try {
            delegate?.onSpeechResult(result.trim())
        } catch (exc: Throwable) {
            Logger.error(LOG_TAG, "Unhandled exception in delegate onSpeechResult", exc)
        }

        progressView?.onResultOrOnError()
        context?.let { initSpeechRecognizer(it) }
    }

    override fun onError(code: Int) {
        Logger.error(LOG_TAG, "Speech recognition error", SpeechRecognitionException(code))
        returnPartialResultsAndRecreateSpeechRecognizer()
    }

    override fun onBufferReceived(bytes: ByteArray?) = Unit

    override fun onEndOfSpeech() {
        progressView?.onEndOfSpeech()
    }

    override fun onEvent(i: Int, bundle: Bundle?) = Unit

    override fun getPartialResultsAsString(): String {
        val out = StringBuilder()
        for (partial in partialData) {
            out.append(partial).append(' ')
        }
        if (!unstableData.isNullOrEmpty()) {
            out.append(unstableData)
        }
        return out.toString().trim()
    }

    @Throws(SpeechRecognitionNotAvailable::class, GoogleVoiceTypingDisabledException::class)
    override fun startListening(progressView: SpeechProgressView?, delegate: SpeechDelegate) {
        if (isListening) return

        val recognizer = speechRecognizer ?: throw SpeechRecognitionNotAvailable()

        if (throttleAction()) {
            Logger.debug(LOG_TAG, "Throttling start to prevent rapid re-trigger")
            return
        }

        if (progressView != null && progressView.parent !is LinearLayout) {
            throw IllegalArgumentException("progressView must be put inside a LinearLayout!")
        }

        this.progressView = progressView
        this.delegate = delegate

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, getPartialResults)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, getIETFLangTag())
            .putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            )
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, preferOffline)

        if (!callingPackage.isNullOrEmpty()) {
            intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, callingPackage)
        }

        try {
            recognizer.startListening(intent)
        } catch (_: SecurityException) {
            throw GoogleVoiceTypingDisabledException()
        }

        isListening = true
        updateLastActionTimestamp()

        try {
            delegate.onStartOfSpeech()
        } catch (exc: Throwable) {
            Logger.error(LOG_TAG, "Unhandled exception in delegate onStartOfSpeech", exc)
        }
    }

    private fun getIETFLangTag(): String {
        val lang = locale.language
        return if (lang.isEmpty()) "en-US" else locale.toLanguageTag()
    }

    override fun stopListening() {
        if (!isListening) return

        if (throttleAction()) {
            Logger.debug(LOG_TAG, "Throttling stop to prevent rapid re-trigger")
            return
        }

        isListening = false
        updateLastActionTimestamp()
        returnPartialResultsAndRecreateSpeechRecognizer()
    }

    override fun initSpeechRecognizer(context: Context) {
        this.context = context

        if (SpeechRecognizer.isRecognitionAvailable(context)) {
            speechRecognizer?.let { recognizer ->
                try {
                    recognizer.destroy()
                } catch (exc: Throwable) {
                    Logger.debug(LOG_TAG, "Non-Fatal error while destroying speech. ${exc.message}")
                } finally {
                    speechRecognizer = null
                }
            }

            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
                setRecognitionListener(this@BaseSpeechRecognitionEngine)
            }
            init(context)
        } else {
            speechRecognizer = null
        }

        clear()
    }

    override fun returnPartialResultsAndRecreateSpeechRecognizer() {
        isListening = false
        try {
            delegate?.onSpeechResult(getPartialResultsAsString())
        } catch (exc: Throwable) {
            Logger.error(LOG_TAG, "Unhandled exception in delegate onSpeechResult", exc)
        }

        progressView?.onResultOrOnError()
        context?.let { initSpeechRecognizer(it) }
    }

    override fun setPartialResults(getPartialResults: Boolean) {
        this.getPartialResults = getPartialResults
    }

    override fun unregisterDelegate() {
        progressView = null
        delegate = null
    }

    override fun setPreferOffline(preferOffline: Boolean) {
        this.preferOffline = preferOffline
    }

    private fun initDelayedStopListening(context: Context) {
        delayedStopListening?.cancel()
        delayedStopListening = DelayedOperation(context, "delayStopListening", stopListeningDelayInMs)
    }

    private fun updateLastActionTimestamp() {
        lastActionTimestamp = SystemClock.elapsedRealtime()
    }

    private fun throttleAction(): Boolean {
        return lastActionTimestamp > 0L &&
            SystemClock.elapsedRealtime() <= (lastActionTimestamp + transitionMinimumDelay)
    }

    override fun setCallingPackage(callingPackage: String?) {
        this.callingPackage = callingPackage
    }

    override fun setTransitionMinimumDelay(milliseconds: Long) {
        this.transitionMinimumDelay = milliseconds
    }

    override fun setStopListeningAfterInactivity(milliseconds: Long) {
        this.stopListeningDelayInMs = milliseconds
    }

    override fun shutdown() {
        delayedStopListening?.cancel()
        speechRecognizer?.let { recognizer ->
            try {
                recognizer.stopListening()
                recognizer.destroy()
            } catch (exc: Exception) {
                Logger.error(LOG_TAG, "Warning while de-initing speech recognizer", exc)
            }
        }
        speechRecognizer = null
        unregisterDelegate()
    }

    companion object {
        private const val LOG_TAG = "BaseSpeechRecognitionEngine"
    }
}

class Speech private constructor(
    private val context: Context,
    callingPackage: String?,
    private val speechRecognitionEngine: SpeechRecognitionEngine = BaseSpeechRecognitionEngine()
) {

    init {
        speechRecognitionEngine.setCallingPackage(callingPackage)
        speechRecognitionEngine.initSpeechRecognizer(context)
    }

    @Synchronized
    fun shutdown() {
        speechRecognitionEngine.shutdown()
        instance = null
    }

    @Throws(SpeechRecognitionNotAvailable::class, GoogleVoiceTypingDisabledException::class)
    @JvmOverloads
    fun startListening(
        progressView: SpeechProgressView? = null,
        delegate: SpeechDelegate
    ) {
        speechRecognitionEngine.startListening(progressView, delegate)
    }

    fun stopListening() {
        speechRecognitionEngine.stopListening()
    }

    val isListening: Boolean
        get() = speechRecognitionEngine.isListening

    fun setPreferOffline(preferOffline: Boolean): Speech = apply {
        speechRecognitionEngine.setPreferOffline(preferOffline)
    }

    fun setGetPartialResults(getPartialResults: Boolean): Speech = apply {
        speechRecognitionEngine.setPartialResults(getPartialResults)
    }

    fun setLocale(locale: Locale): Speech = apply {
        speechRecognitionEngine.locale = locale
    }

    fun setStopListeningAfterInactivity(milliseconds: Long): Speech = apply {
        speechRecognitionEngine.setStopListeningAfterInactivity(milliseconds)
        speechRecognitionEngine.init(context)
    }

    fun setTransitionMinimumDelay(milliseconds: Long): Speech = apply {
        speechRecognitionEngine.setTransitionMinimumDelay(milliseconds)
    }

    val speechToTextLanguage: Locale
        get() = speechRecognitionEngine.locale

    companion object {
        const val GOOGLE_APP_PACKAGE = "com.google.android.googlequicksearchbox"

        @Volatile
        private var instance: Speech? = null

        @JvmStatic
        @JvmOverloads
        @Synchronized
        fun init(context: Context, callingPackage: String? = null): Speech? {
            if (instance == null) {
                instance = Speech(context, callingPackage)
            }
            return instance
        }

        @JvmStatic
        fun getInstance(): Speech? = instance
    }
}
