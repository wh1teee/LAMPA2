package top.rootu.lampa.browser

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.JsResult
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebView.setWebContentsDebuggingEnabled
import androidx.webkit.WebResourceErrorCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewFeature
import top.rootu.lampa.App
import top.rootu.lampa.BuildConfig
import top.rootu.lampa.MainActivity
import top.rootu.lampa.R
import top.rootu.lampa.helpers.Helpers.isTelegramInstalled
import top.rootu.lampa.helpers.Helpers.debugLog
import top.rootu.lampa.helpers.getNetworkErrorString
import top.rootu.lampa.helpers.isAttachedToWindowCompat

// https://developer.android.com/develop/ui/views/layout/webapps/webview#kotlin
class SysView(override val mainActivity: MainActivity, override val viewResId: Int) : Browser {
    private var browser: WebView? = null
    override var isDestroyed = false

    companion object {
        const val LOG_TAG = "WEB CONSOLE"

        val DOCUMENT_START_BOOTSTRAP_JS = """
            (function() {
                try {
                    window.lampa_settings = window.lampa_settings || {};
                    window.lampa_settings.torrents_use = true;
                    window.lampa_settings.demo = false;
                    window.lampa_settings.read_only = false;
                    window.lampa_settings.dcma = false;
                    window.lampa_settings.disable_features = window.lampa_settings.disable_features || {};
                    window.lampa_settings.disable_features.dmca = true;
                    window.lampa_settings.disable_features.lgbt = true;

                    if (typeof localStorage !== 'undefined') {
                        if (!localStorage.getItem('language')) {
                            localStorage.setItem('language', 'ru');
                        }
                        if (localStorage.getItem('parser_use') === null) {
                            localStorage.setItem('parser_use', 'true');
                        }
                        if (!localStorage.getItem('parser_torrent_type')) {
                            localStorage.setItem('parser_torrent_type', 'jackett');
                        }
                        var jUrl = localStorage.getItem('jackett_url') || '';
                        if (!jUrl || jUrl.indexOf('jacred.xyz') !== -1) {
                            localStorage.setItem('jackett_url', 'https://jac.red');
                        }
                        if (!localStorage.getItem('jackett_key')) {
                            localStorage.setItem('jackett_key', '1');
                        }
                        if (localStorage.getItem('parse_in_search') === null) {
                            localStorage.setItem('parse_in_search', 'true');
                        }
                        if (!localStorage.getItem('torrserver_url')) {
                            localStorage.setItem('torrserver_url', 'http://127.0.0.1:8090');
                        }
                        if (!localStorage.getItem('torrserver_url_two')) {
                            localStorage.setItem('torrserver_url_two', 'http://10.0.2.2:8090');
                        }
                        if (localStorage.getItem('internal_torrclient') === null) {
                            localStorage.setItem('internal_torrclient', 'true');
                        }
                        if (localStorage.getItem('torrserver_savedb') === null) {
                            localStorage.setItem('torrserver_savedb', 'true');
                        }
                        if (localStorage.getItem('torrserver_tracktimecode') === null) {
                            localStorage.setItem('torrserver_tracktimecode', 'true');
                        }
                        if (localStorage.getItem('advanced_animation') === null) {
                            localStorage.setItem('advanced_animation', 'true');
                        }
                        if (localStorage.getItem('glass_style') === null) {
                            localStorage.setItem('glass_style', 'true');
                        }
                        if (!localStorage.getItem('glass_opacity')) {
                            localStorage.setItem('glass_opacity', 'medium');
                        }
                    }
                } catch (e) {}
            })();
        """.trimIndent()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun initialize() {
        browser = mainActivity.findViewById(viewResId)
        browser?.apply {
            isFocusable = true
            isFocusableInTouchMode = true
            keepScreenOn = true
            scrollBarStyle = View.SCROLLBARS_INSIDE_OVERLAY
            // No Scrollbars at ALL
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            isScrollContainer = false
            setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true)
            setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        }
        setFocus()

        val settings = browser?.settings
        @Suppress("DEPRECATION")
        settings?.apply {
            javaScriptEnabled = true
            builtInZoomControls = false
            domStorageEnabled = true
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_DEFAULT
            setRenderPriority(WebSettings.RenderPriority.HIGH)
            setNeedInitialFocus(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            mediaPlaybackRequiresUserGesture = false
            if (WebViewFeature.isFeatureSupported(WebViewFeature.OFF_SCREEN_PRERASTER)) {
                WebSettingsCompat.setOffscreenPreRaster(this, true)
            }
        }

        browser?.let { webView ->
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                try {
                    androidx.webkit.WebViewCompat.addDocumentStartJavaScript(
                        webView,
                        DOCUMENT_START_BOOTSTRAP_JS,
                        setOf("*")
                    )
                } catch (_: Exception) {
                }
            }
        }

        browser?.webViewClient = object : WebViewClientCompat() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                view?.evaluateJavascript(DOCUMENT_START_BOOTSTRAP_JS, null)
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                injectPerformanceAndPrefetchScript(view)
                mainActivity.onBrowserPageFinished(view, url)
            }

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): android.webkit.WebResourceResponse? {
                val path = request?.url?.path
                if (path != null && path.endsWith("/plugins/modification.js")) {
                    return android.webkit.WebResourceResponse(
                        "application/javascript",
                        "UTF-8",
                        200,
                        "OK",
                        mapOf("Access-Control-Allow-Origin" to "*"),
                        java.io.ByteArrayInputStream(ByteArray(0))
                    )
                }
                return super.shouldInterceptRequest(view, request)
            }

            // https://developer.android.com/reference/android/webkit/WebViewClient#shouldOverrideUrlLoading(android.webkit.WebView,%20java.lang.String)
            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                debugLog("shouldOverrideUrlLoading(view, url) view $view url $url")
                url?.let {
                    // tg:// — Handle Telegram link
                    if (it.startsWith("tg://")) {
                        if (isTelegramInstalled(mainActivity)) {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                            mainActivity.startActivity(intent)
                        } else {
                            // App.toast("Telegram app is not installed. Get in on Google Play.")
                            redirectToTelegramPlayStore()
                        }
                        return true // Indicate that the URL has been handled
                    }
                    // market:// — open system store chooser (Play/F-Droid/…)
                    if (it.startsWith("market://")) {
                        try {
                            mainActivity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        } catch (_: ActivityNotFoundException) {
                            // fallback: web version of Play Store
                            mainActivity.startActivity(
                                Intent(
                                    Intent.ACTION_VIEW,
                                    Uri.parse("https://play.google.com/store/apps/details?id=org.telegram.messenger")
                                )
                            )
                        }
                        return true
                    }
                    // intent:// — standard intent-URI parsing (Play Store pages redirect to them)
                    if (it.startsWith("intent://")) {
                        try {
                            val intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                            mainActivity.startActivity(intent)
                        } catch (_: Exception) {
                            // ignore — WebView will continue as it can
                        }
                        return true
                    }
                }
                return false // Load the URL in the WebView for other links
                // this will fail for non-http(s) links like lampa:// intent:// etc
                //return super.shouldOverrideUrlLoading(view, url)
            }

            // https://developer.android.com/reference/android/webkit/WebViewClient#shouldOverrideUrlLoading(android.webkit.WebView,%20android.webkit.WebResourceRequest)
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                debugLog("shouldOverrideUrlLoading(view, request) view $view request $request")
                val url = request.url.toString()
                // tg:// — Handle Telegram link
                if (url.startsWith("tg://")) {
                    if (isTelegramInstalled(mainActivity)) {
                        val intent = Intent(Intent.ACTION_VIEW, request.url)
                        mainActivity.startActivity(intent)
                    } else {
                        // App.toast("Telegram app is not installed. Get in on Google Play.")
                        redirectToTelegramPlayStore()
                    }
                    return true // Indicate that the URL has been handled
                }
                // market:// — open system store chooser (Play/F-Droid/…)
                if (url.startsWith("market://")) {
                    try {
                        mainActivity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    } catch (_: ActivityNotFoundException) {
                        // fallback: web version of Play Store
                        mainActivity.startActivity(
                            Intent(
                                Intent.ACTION_VIEW,
                                Uri.parse("https://play.google.com/store/apps/details?id=org.telegram.messenger")
                            )
                        )
                    }
                    return true
                }
                // intent:// — standard intent-URI parsing (Play Store pages redirect to them)
                if (url.startsWith("intent://")) {
                    try {
                        val intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                        mainActivity.startActivity(intent)
                    } catch (_: Exception) {
                        // ignore — WebView will continue as it can
                    }
                    return true
                }
                return false // Load the URL in the WebView for other links
                // this will fail for non-http(s) links like lampa:// intent:// etc
                //return super.shouldOverrideUrlLoading(view, request)
            }


            private fun redirectToTelegramPlayStore() {
                // Open the Telegram app page on the Play Store
                val playStoreIntent = Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=org.telegram.messenger")
                )
                try {
                    mainActivity.startActivity(
                        Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse("market://details?id=org.telegram.messenger")
                        )
                    )
                } catch (_: ActivityNotFoundException) {
                    mainActivity.startActivity(playStoreIntent)
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceErrorCompat
            ) {
                if (WebViewFeature.isFeatureSupported(
                        WebViewFeature.WEB_RESOURCE_ERROR_GET_CODE
                    ) &&
                    WebViewFeature.isFeatureSupported(
                        WebViewFeature.WEB_RESOURCE_ERROR_GET_DESCRIPTION
                    )
                ) {
                    debugLog("ERROR ${error.errorCode} ${error.description} on load ${request.url}")
                    if (request.url.toString().trimEnd('/')
                            .equals(MainActivity.LAMPA_URL, true)
                    ) {
                        view.loadUrl("about:blank")
                        // net::ERR_NAME_NOT_RESOLVED [-2]
                        // net::ERR_TIMED_OUT [-8]
                        // ...
                        val reason =
                            view.context.getNetworkErrorString(error.description.toString())
                        val msg = "${
                            view.context.getString(R.string.download_failed_message)
                        } ${MainActivity.LAMPA_URL} – $reason"
                        // net::ERR_INTERNET_DISCONNECTED [-2]
                        val noInternetErr = "net::ERR_INTERNET_DISCONNECTED"
                        if (error.description == noInternetErr) {
                            val html =
                                createErrorHtmlPage(view.context.getNetworkErrorString(noInternetErr))
                            view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
                            view.invalidate()
                        } else
                            mainActivity.showUrlInputDialog(msg)
                    }
                }
            }

            @SuppressLint("WebViewClientOnReceivedSslError")
            override fun onReceivedSslError(
                view: WebView?,
                handler: SslErrorHandler?,
                error: SslError?
            ) {
                debugLog("Ignore SSL error: $error")
                handler?.proceed() // Ignore SSL certificate errors
            }
        }

        if (BuildConfig.DEBUG)
            browser?.webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                    when (consoleMessage.messageLevel()) {
                        ConsoleMessage.MessageLevel.LOG -> Log.v(LOG_TAG, consoleMessage.message())
                        ConsoleMessage.MessageLevel.WARNING -> Log.w(LOG_TAG, consoleMessage.message())
                        ConsoleMessage.MessageLevel.ERROR -> Log.e(LOG_TAG, consoleMessage.message())
                        ConsoleMessage.MessageLevel.DEBUG -> Log.d(LOG_TAG, consoleMessage.message())
                        else -> Log.i(LOG_TAG,  consoleMessage.message())
                    }
                    return true
                }

                override fun onJsAlert(
                    view: WebView?,
                    url: String?,
                    message: String?,
                    result: JsResult?
                ): Boolean {
                    if (message != null) {
                        App.toast(message)
                    }
                    return false
                }
            }
        

        mainActivity.onBrowserInitCompleted()
    }

    override fun setUserAgentString(ua: String?) {
        browser?.settings?.userAgentString = ua
    }

    override fun getUserAgentString(): String? {
        return browser?.settings?.userAgentString
    }

    @SuppressLint("AddJavascriptInterface", "JavascriptInterface")
    override fun addJavascriptInterface(jsObject: Any, name: String) {
        browser?.addJavascriptInterface(jsObject, name)
    }

    override fun loadUrl(url: String) {
        browser?.loadUrl(url)
    }

    override fun pauseTimers() {
        if (!isDestroyed)
            browser?.pauseTimers()
    }

    override fun resumeTimers() {
        browser?.resumeTimers()
    }

    override fun evaluateJavascript(script: String, resultCallback: (String) -> Unit) {
        browser?.evaluateJavascript(script, resultCallback)
    }

    override fun clearCache(includeDiskFiles: Boolean) {
        browser?.clearCache(includeDiskFiles)
    }

    override fun setKeepVisible(keep: Boolean) {
        (browser as? LampaWebView)?.keepVisible = keep
    }

    override fun destroy() {
        browser?.let {
            // Remove from parent if attached
            if (it.isAttachedToWindowCompat())
                (it.parent as? ViewGroup)?.removeView(it)
        }
        browser?.stopLoading()
        browser?.destroy()
        isDestroyed = true
    }

    override fun setBackgroundColor(color: Int) {
        browser?.setBackgroundColor(color)
    }

    override fun canGoBack(): Boolean {
        return browser?.canGoBack() == true
    }

    override fun goBack() {
        browser?.goBack()
    }

    override fun setFocus() {
        browser?.requestFocus(View.FOCUS_DOWN)
    }

    override fun getView(): View? {
        return browser
    }

    private fun injectPerformanceAndPrefetchScript(view: WebView) {
        val js = """
            (function() {
                if (window.__lampaNativePerfBoost) return;
                window.__lampaNativePerfBoost = true;
                try {
                    window.lampa_settings = window.lampa_settings || {};
                    window.lampa_settings.torrents_use = true;
                    window.lampa_settings.demo = false;
                    window.lampa_settings.read_only = false;
                    window.lampa_settings.dcma = false;
                    window.lampa_settings.disable_features = window.lampa_settings.disable_features || {};
                    window.lampa_settings.disable_features.dmca = true;
                    window.lampa_settings.disable_features.lgbt = true;

                    var style = document.createElement('style');
                    style.id = 'lampa-native-gpu-style';
                    style.textContent = [
                        '.card, .card__view, .items-line, .scroll__body, .full-start__background, .torrent-item, .torrent-file, .torrent-serial, .selectbox-item, .menu__item {',
                        '  will-change: transform;',
                        '  backface-visibility: hidden;',
                        '  -webkit-backface-visibility: hidden;',
                        '  transform: translateZ(0);',
                        '}',
                        '.scroll--mask .scroll__body {',
                        '  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1) !important;',
                        '  -webkit-transition: -webkit-transform 0.24s cubic-bezier(0.22, 1, 0.36, 1) !important;',
                        '}',
                        '.card__view {',
                        '  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s cubic-bezier(0.22, 1, 0.36, 1) !important;',
                        '}',
                        '.card.focus .card__view, .card.hover .card__view {',
                        '  transform: scale(1.05) translateZ(0);',
                        '  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.55) !important;',
                        '}',
                        '.full-start__button, .torrent-item, .torrent-file, .torrent-serial, .selectbox-item, .menu__item, .head__action {',
                        '  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.18s ease-out, color 0.18s ease-out, box-shadow 0.18s ease-out !important;',
                        '}',
                        '.full-start__button.focus {',
                        '  transform: scale(1.04) translateZ(0);',
                        '}',
                        '.torrent-item.focus, .torrent-file.focus, .torrent-serial.focus {',
                        '  transform: scale(1.012) translateZ(0);',
                        '  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), inset 0 0 0 1.5px rgba(255, 255, 255, 0.85) !important;',
                        '}'
                    ].join('\n');
                    if (document.head) document.head.appendChild(style);
                    if (document.body) {
                        document.body.classList.add('advanced--animation');
                    }

                    var markImagesAsync = function(root) {
                        if (!root || !root.querySelectorAll) return;
                        var imgs = root.querySelectorAll('img:not([decoding])');
                        for (var i = 0; i < imgs.length; i++) {
                            imgs[i].setAttribute('decoding', 'async');
                        }
                    };
                    markImagesAsync(document);

                    var hoverTimer = null;
                    var streamHoverTimer = null;
                    var currentFocusedCardId = null;
                    var preloadedBackdrops = {};
                    var preloadedCards = {};
                    var preloadedParsers = {};

                    var prefetchCardTorrents = function(card) {
                        try {
                            if (!card || !card.id || preloadedParsers[card.id]) return;
                            if (!Array.isArray(card.genres)) return;
                            if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.field('parser_use') || !Lampa.Parser || !Lampa.Parser.get) return;
                            if (!card.title && card.name) card.title = card.name;
                            if (!card.original_title && card.original_name) card.original_title = card.original_name;
                            var title = card.title || card.name || '';
                            var orig = card.original_title || card.original_name || title;
                            if (!title && !orig) return;
                            preloadedParsers[card.id] = true;
                            var year = ((card.first_air_date || card.release_date || '0000') + '').slice(0, 4);
                            var combinations = {
                                'df': orig,
                                'df_year': orig + ' ' + year,
                                'df_lg': orig + ' ' + title,
                                'df_lg_year': orig + ' ' + title + ' ' + year,
                                'lg': title,
                                'lg_year': title + ' ' + year,
                                'lg_df': title + ' ' + orig,
                                'lg_df_year': title + ' ' + orig + ' ' + year
                            };
                            var searchStr = combinations[Lampa.Storage.field('parse_lang')] || title || orig;
                            if (!searchStr) return;
                            Lampa.Parser.get({
                                search: searchStr,
                                search_one: title,
                                search_two: orig,
                                movie: card,
                                page: 1
                            }, function() {}, function() {});
                        } catch (err) {}
                    };

                    // Stage 1: Catalog Card Focus -> Preload w1280 backdrop + warm Lampa.Api.full 7-day cache + chain into Parser prefetch
                    var triggerFocusPrefetch = function(el) {
                        if (!el) return;
                        clearTimeout(hoverTimer);
                        clearTimeout(streamHoverTimer);
                        hoverTimer = setTimeout(function() {
                            try {
                                var cd = el.card_data || (el.parentElement && el.parentElement.card_data);
                                if (cd && cd.id && window.Lampa) {
                                    currentFocusedCardId = cd.id;
                                    if (cd.backdrop_path && Lampa.Api && Lampa.Api.img) {
                                        var bgUrl = Lampa.Api.img(cd.backdrop_path, 'w1280');
                                        if (bgUrl && !preloadedBackdrops[bgUrl]) {
                                            preloadedBackdrops[bgUrl] = true;
                                            var img = new Image();
                                            img.decoding = 'async';
                                            img.src = bgUrl;
                                        }
                                    }
                                    var src = cd.source || (Lampa.Storage && Lampa.Storage.field('source')) || 'tmdb';
                                    var method = cd.name || cd.first_air_date ? 'tv' : 'movie';
                                    var cKey = src + ':' + method + ':' + cd.id;
                                    if (!preloadedCards[cKey] && Lampa.Api && Lampa.Api.full) {
                                        preloadedCards[cKey] = true;
                                        Lampa.Api.full({
                                            id: cd.id,
                                            method: method,
                                            card: cd,
                                            source: src
                                        }, function(data) {
                                            if (data && data.movie) {
                                                preloadedCards[cKey] = data.movie;
                                                if (currentFocusedCardId === cd.id) {
                                                    prefetchCardTorrents(data.movie);
                                                }
                                            }
                                        }, function() {});
                                    } else if (typeof preloadedCards[cKey] === 'object') {
                                        prefetchCardTorrents(preloadedCards[cKey]);
                                    }
                                } else {
                                    var bg = el.getAttribute('data-backdrop') || el.getAttribute('data-bg') || (el.dataset && (el.dataset.backdrop || el.dataset.bg));
                                    if (bg && !preloadedBackdrops[bg]) {
                                        preloadedBackdrops[bg] = true;
                                        var img2 = new Image();
                                        img2.decoding = 'async';
                                        img2.src = bg;
                                    }
                                }
                            } catch (e) {}
                        }, 320);

                        streamHoverTimer = setTimeout(function() {
                            try {
                                var streamUrl = el.getAttribute('data-stream') || el.getAttribute('data-url') || el.getAttribute('data-file') || (el.dataset && (el.dataset.stream || el.dataset.url || el.dataset.file));
                                if (streamUrl && (streamUrl.indexOf('/stream/') !== -1 || streamUrl.indexOf('/play') !== -1 || streamUrl.indexOf('magnet:') === 0) && window.AndroidJS && window.AndroidJS.prefetchHint) {
                                    window.AndroidJS.prefetchHint(streamUrl);
                                }
                            } catch (e) {}
                        }, 420);
                    };

                    // Fix upstream Lampa Scroll.startScroll 300ms Layer.visible() drop during fast D-Pad scrolling
                    var scrollVisTimer = null;
                    document.addEventListener('transitionend', function(ev) {
                        if (ev && ev.target && ev.target.classList && ev.target.classList.contains('scroll__body')) {
                            clearTimeout(scrollVisTimer);
                            var targetEl = ev.target;
                            scrollVisTimer = setTimeout(function() {
                                try {
                                    if (window.Lampa && Lampa.Layer && Lampa.Layer.visible) {
                                        Lampa.Layer.visible(targetEl.parentElement || targetEl);
                                    }
                                } catch (e) {}
                            }, 120);
                        }
                    }, true);

                    // Stage 2 & 3: Hook Lampa native listeners for Full Card Torrent Prefetch + Instant TorrServer File List + Live Timeline Sync
                    var attachLampaHooks = function() {
                        if (!window.Lampa || !Lampa.Listener || window.__lampaHooksAttached) return false;
                        window.__lampaHooksAttached = true;

                        try {
                            if (Lampa.Storage) {
                                if (!Lampa.Storage.get('jackett_url', '') || Lampa.Storage.get('jackett_url', '').indexOf('jacred.xyz') !== -1) {
                                    Lampa.Storage.set('jackett_url', 'https://jac.red', true);
                                    Lampa.Storage.set('jackett_key', '1', true);
                                    Lampa.Storage.set('parser_use', true, true);
                                    Lampa.Storage.set('parser_torrent_type', 'jackett', true);
                                }
                                if (Lampa.Storage.get('torrserver_url', '') && !Lampa.Storage.field('internal_torrclient')) {
                                    Lampa.Storage.set('internal_torrclient', true, true);
                                }
                            }
                        } catch (e) {}

                        // Patch Lampa.Player.play & Lampa.Player.playlist (PR #362 backport + IPC payload slimming)
                        // 1) Ensures torrent playlist URLs always use &play instead of &preload
                        // 2) Strips N-times duplicated full TMDB card/raw/playlist objects copied onto each playlist_element
                        //    by torrent.js before AndroidJS.openPlayer serializes the JSON over JNI (reduces 73-ep payload from ~4.4MB to ~80KB)
                        try {
                            if (Lampa.Player && !Lampa.Player.__nativePlaylistPatched) {
                                Lampa.Player.__nativePlaylistPatched = true;
                                var sanitizePlaylistItems = function(list) {
                                    if (!Array.isArray(list)) return;
                                    for (var i = 0; i < list.length; i++) {
                                        var item = list[i];
                                        if (item && typeof item === 'object') {
                                            if (typeof item.url === 'string' && item.url.indexOf('&preload') !== -1) {
                                                item.url = item.url.replace('&preload', '&play');
                                            }
                                            if (item.card && typeof item.card === 'object') {
                                                if (item.card.id && !item.tmdb_id) item.tmdb_id = item.card.id;
                                                if (item.card.imdb_id && !item.imdb_id) item.imdb_id = item.card.imdb_id;
                                                item.card = {
                                                    id: item.card.id,
                                                    imdb_id: item.card.imdb_id,
                                                    title: item.card.title || item.card.name,
                                                    original_name: item.card.original_name
                                                };
                                            }
                                            delete item.playlist;
                                            delete item.raw;
                                        }
                                    }
                                };
                                if (Lampa.Player.play) {
                                    var origPlay = Lampa.Player.play.bind(Lampa.Player);
                                    Lampa.Player.play = function(params) {
                                        if (params && typeof params === 'object') {
                                            if (typeof params.url === 'string' && params.url.indexOf('&preload') !== -1 &&
                                                Lampa.Storage && Lampa.Storage.field('player_torrent') === 'android') {
                                                params.url = params.url.replace('&preload', '&play');
                                            }
                                            if (Array.isArray(params.playlist)) {
                                                sanitizePlaylistItems(params.playlist);
                                            }
                                        }
                                        return origPlay(params);
                                    };
                                }
                                if (Lampa.Player.playlist) {
                                    var origPlaylist = Lampa.Player.playlist.bind(Lampa.Player);
                                    Lampa.Player.playlist = function(playlist) {
                                        sanitizePlaylistItems(playlist);
                                        return origPlaylist(playlist);
                                    };
                                }
                            }
                        } catch (e) {}

                        // Patch Lampa.Timeline.view & update so live element.timeline references stay synchronized in-place
                        // and player-measured durations are not overwritten by TMDB approximate runtime when reopening file lists
                        try {
                            if (Lampa.Timeline && Lampa.Timeline.view && Lampa.Timeline.update && !Lampa.Timeline.__nativePatched) {
                                Lampa.Timeline.__nativePatched = true;
                                var origView = Lampa.Timeline.view.bind(Lampa.Timeline);
                                var origUpdate = Lampa.Timeline.update.bind(Lampa.Timeline);
                                var liveTimelines = {};
                                var playerMeasured = {};

                                Lampa.Timeline.view = function(hash, meta) {
                                    var v = origView(hash, meta);
                                    if (v && v.hash && v.hash != 0) {
                                        liveTimelines[v.hash] = v;
                                        if (v.time > 0 && v.duration > 0 && v.percent > 0) {
                                            playerMeasured[v.hash] = {
                                                time: v.time,
                                                duration: v.duration,
                                                percent: v.percent
                                            };
                                        }
                                    }
                                    return v;
                                };

                                Lampa.Timeline.update = function(params) {
                                    if (params && params.hash && params.hash != 0) {
                                        var live = liveTimelines[params.hash];
                                        var pm = playerMeasured[params.hash];
                                        // If called by list$2 with serverView.timecode after clobbering view.duration with movie.runtime*60,
                                        // preserve the exact player-measured duration and percentage
                                        if (params === live && pm && pm.duration > 0 && Math.abs((params.time || 0) - pm.time) <= 2) {
                                            params.duration = pm.duration;
                                            params.percent = pm.percent;
                                        } else if (params.time > 0 && params.duration > 0) {
                                            playerMeasured[params.hash] = {
                                                time: Math.round(params.time),
                                                duration: Math.round(params.duration),
                                                percent: params.percent
                                            };
                                        }
                                        origUpdate(params);
                                        if (live && live !== params) {
                                            live.percent = params.percent;
                                            if (typeof params.time !== 'undefined') live.time = Math.round(params.time);
                                            if (typeof params.duration !== 'undefined') live.duration = Math.round(params.duration);
                                            if (params.card) live.card = params.card;
                                            if (typeof params.season !== 'undefined') live.season = params.season;
                                            if (typeof params.episode !== 'undefined') live.episode = params.episode;
                                        }
                                    } else {
                                        origUpdate(params);
                                    }
                                };
                            }
                        } catch (e) {}

                        // Patch Lampa.Torserver to eliminate the 2,000ms forced setInterval delay when opening torrent file lists
                        try {
                            if (Lampa.Torserver && !Lampa.Torserver.__nativeFastPatch) {
                                Lampa.Torserver.__nativeFastPatch = true;
                                var lastConnectedTs = 0;
                                var cachedFileStats = {};
                                var origConnected = Lampa.Torserver.connected.bind(Lampa.Torserver);
                                var origHash = Lampa.Torserver.hash.bind(Lampa.Torserver);
                                var origFiles = Lampa.Torserver.files.bind(Lampa.Torserver);

                                Lampa.Torserver.connected = function(success, fail) {
                                    if (Date.now() - lastConnectedTs < 30000) {
                                        success();
                                        return;
                                    }
                                    origConnected(function() {
                                        lastConnectedTs = Date.now();
                                        success();
                                    }, fail);
                                };

                                Lampa.Torserver.hash = function(object, success, fail) {
                                    origHash(object, function(json) {
                                        lastConnectedTs = Date.now();
                                        if (json && json.hash && json.file_stats && json.file_stats.length) {
                                            cachedFileStats[json.hash] = json;
                                        }
                                        var origSetInterval = window.setInterval;
                                        window.setInterval = function(fn, delay) {
                                            if (delay === 2000) {
                                                setTimeout(fn, 15);
                                                return origSetInterval.call(window, fn, 350);
                                            }
                                            return origSetInterval.apply(window, arguments);
                                        };
                                        try {
                                            success(json);
                                        } finally {
                                            window.setInterval = origSetInterval;
                                        }
                                    }, fail);
                                };

                                Lampa.Torserver.files = function(hash, success, fail) {
                                    if (hash && cachedFileStats[hash]) {
                                        var cached = cachedFileStats[hash];
                                        delete cachedFileStats[hash];
                                        success(cached);
                                        return;
                                    }
                                    origFiles(hash, success, fail);
                                };

                                if (Lampa.Torserver.stream) {
                                    var origStream = Lampa.Torserver.stream.bind(Lampa.Torserver);
                                    Lampa.Torserver.stream = function(path, hash, id) {
                                        var url = origStream(path, hash, id);
                                        // External Android players (ViMu, Just Player, VLC, MPV) stream &play directly
                                        // and should not be blocked behind Lampa's 95% frontend preload gate
                                        if (typeof url === 'string' && Lampa.Storage && Lampa.Storage.field('player_torrent') === 'android') {
                                            return url.replace('&preload', '&play');
                                        }
                                        return url;
                                    };
                                }
                            }
                        } catch (e) {}

                        // Strip non-interactive .watched-history.selector banner from stealing initial focus on Torrents screen
                        var torrentListFocusTimer = null;
                        Lampa.Listener.follow('torrent', function(e) {
                            if (e && e.type === 'render') {
                                clearTimeout(torrentListFocusTimer);
                                torrentListFocusTimer = setTimeout(function() {
                                    try {
                                        var wh = document.querySelectorAll('.torrent-list .watched-history.selector');
                                        var hadFocus = false;
                                        for (var i = 0; i < wh.length; i++) {
                                            if (wh[i].classList.contains('focus')) hadFocus = true;
                                            wh[i].classList.remove('selector', 'focus');
                                        }
                                        if (hadFocus && Lampa.Controller) {
                                            var firstTorrent = document.querySelector('.torrent-list .torrent-item.selector');
                                            var scrollBody = document.querySelector('.torrent-list');
                                            if (firstTorrent && scrollBody) {
                                                Lampa.Controller.collectionSet(scrollBody.parentElement || scrollBody);
                                                Lampa.Controller.collectionFocus(firstTorrent, scrollBody.parentElement || scrollBody);
                                            }
                                        }
                                    } catch (err) {}
                                }, 20);
                            }
                        });

                        // Stage 2: When a movie/series card opens, silently prefetch Jackett/RuTracker torrents into AndroidJS.parserCache
                        Lampa.Listener.follow('full', function(e) {
                            if (e && (e.type === 'start' || e.type === 'complite') && e.data && e.data.movie) {
                                var movie = e.data.movie;
                                setTimeout(function() {
                                    prefetchCardTorrents(movie);
                                }, 80);
                            }
                        });

                        // Stage 3: Pre-warm TorrServer stream buffer + fix .torrnet-folder-name.selector focus trap in multi-season torrents
                        var torrentFileTimer = null;
                        Lampa.Listener.follow('torrent_file', function(e) {
                            if (!e) return;
                            if (e.type === 'list_open') {
                                setTimeout(function() {
                                    try {
                                        // Remove non-interactive .torrnet-folder-name from D-Pad selector collection
                                        var folderHeaders = document.querySelectorAll('.torrnet-folder-name.selector');
                                        var hadFocusedFolder = false;
                                        for (var i = 0; i < folderHeaders.length; i++) {
                                            if (folderHeaders[i].classList.contains('focus')) hadFocusedFolder = true;
                                            folderHeaders[i].classList.remove('selector', 'focus');
                                        }
                                        var focusedEp = document.querySelector('.torrent-file.focus, .torrent-serial.focus');
                                        var firstEp = document.querySelector('.torrent-file.selector, .torrent-serial.selector');
                                        if ((!focusedEp || hadFocusedFolder) && firstEp && Lampa.Controller && Lampa.Modal) {
                                            Lampa.Controller.collectionSet(Lampa.Modal.scroll().render());
                                            Lampa.Controller.collectionFocus(firstEp, Lampa.Modal.scroll().render());
                                        }
                                    } catch (err) {}
                                    if (e.items && e.items.length >= 1 && e.items[0] && e.items[0].url && window.AndroidJS && window.AndroidJS.prefetchHint) {
                                        window.AndroidJS.prefetchHint(e.items[0].url);
                                    }
                                }, 30);
                            } else if (e.type === 'onfocus' && e.element && e.element.url) {
                                clearTimeout(torrentFileTimer);
                                var u = e.element.url;
                                torrentFileTimer = setTimeout(function() {
                                    if (window.AndroidJS && window.AndroidJS.prefetchHint) {
                                        window.AndroidJS.prefetchHint(u);
                                    }
                                }, 350);
                            }
                        });
                        return true;
                    };

                    if (!attachLampaHooks()) {
                        var hookPoll = setInterval(function() {
                            if (attachLampaHooks()) clearInterval(hookPoll);
                        }, 200);
                        setTimeout(function() { clearInterval(hookPoll); }, 10000);
                    }

                    if (window.MutationObserver && document.body) {
                        var obs = new MutationObserver(function(mutations) {
                            for (var i = 0; i < mutations.length; i++) {
                                var m = mutations[i];
                                if (m.type === 'attributes' && m.attributeName === 'class') {
                                    var target = m.target;
                                    if (target && target.classList && target.classList.contains('focus')) {
                                        triggerFocusPrefetch(target);
                                    }
                                } else if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
                                    for (var j = 0; j < m.addedNodes.length; j++) {
                                        var node = m.addedNodes[j];
                                        if (node && node.nodeType === 1) markImagesAsync(node);
                                    }
                                }
                            }
                        });
                        obs.observe(document.body, {
                            childList: true,
                            subtree: true,
                            attributes: true,
                            attributeFilter: ['class']
                        });
                    }
                } catch (err) {}
            })();
        """.trimIndent()
        view.evaluateJavascript(js, null)
    }

    private fun createErrorHtmlPage(
        errorMessage: String,
        iconColor: String = "#D72828",
        textColor: String = "#E6E6E6"
    ): String {
        return """
        <html>
            <body style="margin:0;padding:0;overflow:hidden;">
                <div style="display:table;width:100%;height:100vh;overflow:hidden;">
                    <div align="center" style="display:table-cell;vertical-align:middle;">
                        <svg width="120" height="120" 
                             style="overflow:visible;enable-background:new 0 0 120 120" 
                             viewBox="0 0 32 32" 
                             xmlns="http://www.w3.org/2000/svg">
                            <g>
                                <circle cx="16" cy="16" r="16" style="fill:$iconColor;"/>
                                <path d="M14.5,25h3v-3h-3V25z M14.5,6v13h3V6H14.5z" 
                                      style="fill:$textColor;"/>
                            </g>
                        </svg>
                        <br/><br/>
                        <p style="color:$textColor;">$errorMessage</p>
                    </div>
                </div>
            </body>
        </html>
        """.trimIndent()
    }
}