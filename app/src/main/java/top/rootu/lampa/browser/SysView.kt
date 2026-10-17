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
                        '.card, .card__view, .items-line, .scroll__body, .full-start__background, .torrent-item, .torrent-file, .torrent-serial {',
                        '  will-change: transform;',
                        '  backface-visibility: hidden;',
                        '  -webkit-backface-visibility: hidden;',
                        '  transform: translateZ(0);',
                        '}',
                        '.card.focus .card__view {',
                        '  transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.16s ease-out !important;',
                        '}'
                    ].join('\n');
                    if (document.head) document.head.appendChild(style);

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
                            if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.field('parser_use') || !Lampa.Parser || !Lampa.Parser.get) return;
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
                                    var method = cd.name ? 'tv' : 'movie';
                                    var cKey = src + ':' + method + ':' + cd.id;
                                    if (!preloadedCards[cKey] && Lampa.Api && Lampa.Api.full) {
                                        preloadedCards[cKey] = true;
                                        Lampa.Api.full({
                                            id: cd.id,
                                            method: method,
                                            card: cd,
                                            source: src
                                        }, function(data) {
                                            if (data && data.movie && currentFocusedCardId === cd.id) {
                                                prefetchCardTorrents(data.movie);
                                            }
                                        }, function() {});
                                    } else if (preloadedCards[cKey]) {
                                        prefetchCardTorrents(cd);
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

                    // Stage 2 & 3: Hook Lampa native listeners for Full Card Torrent Prefetch + Episode Focus Preload
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

                        // Stage 2: When a movie/series card opens, silently prefetch Jackett/RuTracker torrents into AndroidJS.parserCache
                        Lampa.Listener.follow('full', function(e) {
                            if (e && (e.type === 'start' || e.type === 'complite') && e.data && e.data.movie) {
                                var movie = e.data.movie;
                                setTimeout(function() {
                                    prefetchCardTorrents(movie);
                                }, 80);
                            }
                        });

                        // Stage 3: When D-Pad focuses a file/episode in TorrServer file list, pre-warm TorrServer stream buffer
                        var torrentFileTimer = null;
                        Lampa.Listener.follow('torrent_file', function(e) {
                            if (e && e.type === 'onfocus' && e.element && e.element.url) {
                                clearTimeout(torrentFileTimer);
                                var u = e.element.url;
                                torrentFileTimer = setTimeout(function() {
                                    if (window.AndroidJS && window.AndroidJS.prefetchHint) {
                                        window.AndroidJS.prefetchHint(u);
                                    }
                                }, 400);
                            }
                        });
                        return true;
                    };

                    if (!attachLampaHooks()) {
                        var hookPoll = setInterval(function() {
                            if (attachLampaHooks()) clearInterval(hookPoll);
                        }, 250);
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