package top.rootu.lampa.channels

import android.util.Log
import top.rootu.lampa.helpers.Helpers.isTvContentProviderAvailable
import java.util.concurrent.Executors

/** One queue shared by all bridge instances, including after activity recreation. */
internal object PluginChannels {
    private val publisher = PluginChannelPublisher(
        Executors.newSingleThreadExecutor { task -> Thread(task, "plugin-channels") },
        { isTvContentProviderAvailable },
        { request ->
            ChannelManager.replacePluginChannel(request)
        },
        { error -> Log.e("PluginChannels", "Plugin channel operation failed: ${error.javaClass.simpleName}") }
    )

    fun publish(json: String?): Boolean = publisher.publish(json)
    fun clear(id: String?): Boolean = publisher.clear(id)
}
