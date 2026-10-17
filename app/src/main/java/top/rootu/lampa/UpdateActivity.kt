package top.rootu.lampa

import android.annotation.SuppressLint
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import top.rootu.lampa.helpers.Updater
import top.rootu.lampa.helpers.hideSystemUI

class UpdateActivity : BaseActivity() {

    private val mainHandler = Handler(Looper.getMainLooper())

    @SuppressLint("SetTextI18n")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_update)
        hideSystemUI()

        val pbUpdate = findViewById<ProgressBar>(R.id.pbUpdate)
        val tvUpdateTitle = findViewById<TextView>(R.id.tvUpdateTitle)
        val tvCurrentVersion = findViewById<TextView>(R.id.tvCurrentVersion)
        val tvNewVersion = findViewById<TextView>(R.id.tvNewVersion)
        val tvOverview = findViewById<TextView>(R.id.tvOverview)
        val btnCancel = findViewById<Button>(R.id.btnCancel)
        val btnUpdate = findViewById<Button>(R.id.btnUpdate)

        tvUpdateTitle?.text =
            String.format(getString(R.string.update_app_found), getString(R.string.app_name))
        tvCurrentVersion?.text =
            "${getString(R.string.update_cur_version)}: ${BuildConfig.VERSION_NAME}"

        btnCancel?.setOnClickListener {
            finish()
        }

        btnUpdate?.isEnabled = false
        pbUpdate?.visibility = View.VISIBLE

        lifecycleScope.launch {
            val hasUpdate = withContext(Dispatchers.IO) {
                Updater.check()
            }
            if (!hasUpdate) {
                finish()
                return@launch
            }
            pbUpdate?.visibility = View.GONE
            tvNewVersion?.text =
                "${getString(R.string.update_new_version)}: ${Updater.getVersion()}"
            tvOverview?.text = Updater.getOverview()
            btnUpdate?.isEnabled = true
            btnUpdate?.requestFocus()
        }

        btnUpdate?.setOnClickListener { button ->
            button.isEnabled = false
            lifecycleScope.launch(Dispatchers.IO) {
                if (update()) {
                    finish()
                }
                withContext(Dispatchers.Main) {
                    button.isEnabled = true
                }
            }
        }
    }

    @SuppressLint("SetTextI18n")
    private suspend fun update(): Boolean {
        val progressBar = findViewById<ProgressBar>(R.id.pbUpdate)
        val tvUpdateInfo = findViewById<TextView>(R.id.tvUpdateInfo)
        val tvUpdatePrc = findViewById<TextView>(R.id.tvUpdatePrc)

        withContext(Dispatchers.Main) {
            progressBar.visibility = View.VISIBLE
            progressBar.isIndeterminate = false
            tvUpdateInfo.setText(R.string.update_loading)
        }
        try {
            Updater.installNewVersion { prc ->
                mainHandler.post {
                    progressBar.setProgress(prc, true)
                    tvUpdatePrc.text = "$prc%"
                }
            }
            delay(1000)
            withContext(Dispatchers.Main) {
                progressBar.visibility = View.GONE
                progressBar.isIndeterminate = true
                tvUpdateInfo.text = ""
                tvUpdatePrc.text = ""
            }
            return true
        } catch (e: Exception) {
            withContext(Dispatchers.Main) {
                val msg = "Error: " + (e.message ?: "")
                tvUpdateInfo.text = msg
                progressBar.visibility = View.GONE
            }
        }
        return false
    }
}