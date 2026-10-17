package top.rootu.lampa.helpers

import android.content.Intent
import android.text.Spanned
import androidx.core.content.FileProvider
import androidx.core.text.HtmlCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.Request
import top.rootu.lampa.App
import top.rootu.lampa.BuildConfig
import top.rootu.lampa.R
import top.rootu.lampa.helpers.Helpers.getJson
import top.rootu.lampa.models.Release
import top.rootu.lampa.models.Releases
import top.rootu.lampa.net.HttpHelper
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

object Updater {
    private const val RELEASE_LINK =
        "https://api.github.com/repos/${BuildConfig.REPO_ID}/releases"

    @Volatile
    private var releases: Releases? = null

    @Volatile
    private var newVersion: Release? = null

    fun check(): Boolean {
        return try {
            val request = Request.Builder()
                .url(RELEASE_LINK)
                .header("Accept", "application/vnd.github+json")
                .header("User-Agent", HttpHelper.userAgent)
                .build()

            HttpHelper.client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return false
                val body = response.body.string()
                if (body.isEmpty()) return false
                val parsed = getJson(body, Releases::class.java)
                releases = parsed
                parsed?.forEach { rel ->
                    if (isNewerVersion(rel.tag_name)) {
                        newVersion = rel
                        return true
                    }
                }
                false
            }
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    fun getVersion(): String {
        if (newVersion == null) {
            CoroutineScope(Dispatchers.IO).launch {
                check()
            }
        }
        return newVersion?.tag_name?.removePrefix("v")?.removePrefix("V").orEmpty()
    }

    fun getOverview(): Spanned {
        val sb = StringBuilder()
        releases?.forEach { rel ->
            val formattedBody = rel.body.replace("\r\n", "<br/>")
            if (isNewerVersion(rel.tag_name)) {
                sb.append("<font color='white'><b>").append(rel.tag_name).append("</b></font> <br>")
                sb.append("<i>").append(formattedBody).append("</i><br/><br/>")
            } else {
                sb.append(rel.tag_name).append("<br>")
                sb.append("<i>").append(formattedBody).append("</i><br/><br/>")
            }
        }
        return HtmlCompat.fromHtml(sb.toString().trim(), HtmlCompat.FROM_HTML_MODE_LEGACY)
    }

    // Integer segments: "12.10".toDouble() == 12.1, so 1.12.9 looked newer than 1.12.10.
    private fun parseVersion(version: String): List<Int> {
        val numeric = version.trim()
            .removePrefix("v")
            .removePrefix("V")
            .substringBefore("-") // git describe: 1.12.10-5-gabcdef
            .substringBefore("+")
        return numeric.split('.')
            .map { part -> part.filter { it.isDigit() }.toIntOrNull() ?: 0 }
    }

    private fun compareVersions(remote: String, local: String): Int {
        val remoteParts = parseVersion(remote)
        val localParts = parseVersion(local)
        val size = maxOf(remoteParts.size, localParts.size)
        for (i in 0 until size) {
            val remoteSeg = remoteParts.getOrElse(i) { 0 }
            val localSeg = localParts.getOrElse(i) { 0 }
            if (remoteSeg != localSeg) return remoteSeg.compareTo(localSeg)
        }
        return 0
    }

    private fun isNewerVersion(
        remote: String,
        local: String = BuildConfig.VERSION_NAME
    ): Boolean {
        return compareVersions(remote, local) > 0
    }

    private val downloadLock = Any()

    private fun downloadApk(file: File, onProgress: ((prc: Int) -> Unit)?) {
        synchronized(downloadLock) {
            val rel = newVersion ?: return
            if (file.exists()) {
                file.delete()
            }

            val flavorMarker = "-${BuildConfig.FLAVOR}-"
            val selectedAsset = rel.assets.firstOrNull {
                it.browser_download_url.endsWith(".apk", ignoreCase = true) &&
                    it.browser_download_url.contains(flavorMarker, ignoreCase = true)
            } ?: rel.assets.firstOrNull {
                it.browser_download_url.endsWith(".apk", ignoreCase = true)
            }

            val link = selectedAsset?.browser_download_url.orEmpty()
            if (link.isEmpty()) return

            try {
                val downloadClient = HttpHelper.client.newBuilder()
                    .readTimeout(120, TimeUnit.SECONDS)
                    .callTimeout(300, TimeUnit.SECONDS)
                    .build()

                val request = Request.Builder()
                    .url(link)
                    .header("User-Agent", HttpHelper.userAgent)
                    .build()

                downloadClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        throw Exception("Failed to download APK: HTTP ${response.code}")
                    }
                    val body = response.body
                    val contentLength = body.contentLength()
                    body.byteStream().use { input ->
                        FileOutputStream(file).use { fileOut ->
                            if (onProgress == null || contentLength <= 0L) {
                                input.copyTo(fileOut)
                            } else {
                                val buffer = ByteArray(64 * 1024)
                                var offset = 0L
                                while (true) {
                                    val read = input.read(buffer)
                                    if (read <= 0) break
                                    fileOut.write(buffer, 0, read)
                                    offset += read
                                    val prc = ((offset * 100L) / contentLength).toInt().coerceIn(0, 100)
                                    onProgress(prc)
                                }
                            }
                            fileOut.flush()
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                throw e
            }
        }
    }

    fun installNewVersion(onProgress: ((prc: Int) -> Unit)?) {
        val ctx = App.context
        if (newVersion == null && !check()) return

        newVersion?.let {
            val destination = File(
                ctx.getExternalFilesDir(null) ?: ctx.cacheDir,
                "LAMPA.apk"
            ).apply {
                parentFile?.mkdirs()
                deleteOnExit()
            }

            downloadApk(destination, onProgress)

            val fileUri = FileProvider.getUriForFile(
                ctx,
                "${BuildConfig.APPLICATION_ID}.update_provider",
                destination
            )
            val install = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(fileUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            if (install.resolveActivity(ctx.packageManager) != null) {
                ctx.startActivity(install)
            } else {
                App.toast(R.string.error_app_not_found)
            }
        }
    }
}
