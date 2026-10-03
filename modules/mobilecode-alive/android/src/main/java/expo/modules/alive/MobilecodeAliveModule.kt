package expo.modules.alive

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MobilecodeAliveModule : Module() {
  override fun definition() =
    ModuleDefinition {
      Name("MobilecodeAlive")

      Function("start") { title: String, message: String ->
        val context = appContext.reactContext ?: return@Function null
        val intent =
          Intent(context, AliveService::class.java).apply {
            putExtra(AliveService.EXTRA_TITLE, title)
            putExtra(AliveService.EXTRA_MESSAGE, message)
          }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      }

      Function("stop") {
        val context = appContext.reactContext ?: return@Function null
        context.stopService(Intent(context, AliveService::class.java))
      }
    }
}
