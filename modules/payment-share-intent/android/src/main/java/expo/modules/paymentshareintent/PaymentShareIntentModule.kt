package expo.modules.paymentshareintent

import android.content.ActivityNotFoundException
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

private const val SHARE_ID_EXTRA = "com.farmtrack.payment-share-id"

class PaymentShareIntentModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PaymentShareIntent")
    Events("onShare")

    AsyncFunction("getInitialSharedText") {
      val intent = appContext.currentActivity?.intent ?: return@AsyncFunction null
      readSharedText(intent)
    }

    AsyncFunction("clearSharedText") { shareId: String ->
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      val intent = activity.intent
      if (intent.getStringExtra(SHARE_ID_EXTRA) != shareId) {
        return@AsyncFunction false
      }
      activity.setIntent(
        Intent(intent).apply {
          action = Intent.ACTION_MAIN
          type = null
          data = null
          clipData = null
          removeExtra(Intent.EXTRA_TEXT)
          removeExtra(SHARE_ID_EXTRA)
          removeCategory(Intent.CATEGORY_DEFAULT)
        }
      )
      true
    }

    AsyncFunction("openMessagesApp") {
      val activity = appContext.currentActivity
        ?: throw IllegalStateException("FarmTrack could not open the Messages app.")
      val intent = Intent.makeMainSelectorActivity(
        Intent.ACTION_MAIN,
        Intent.CATEGORY_APP_MESSAGING,
      )
      try {
        activity.startActivity(intent)
      } catch (error: ActivityNotFoundException) {
        throw IllegalStateException("No Messages app is available on this device.", error)
      }
      true
    }

    OnNewIntent { intent ->
      appContext.currentActivity?.setIntent(intent)
      readSharedText(intent)?.let { shared ->
        sendEvent("onShare", shared)
      }
    }
  }

  private fun readSharedText(intent: Intent): Map<String, Any>? {
    if (intent.action != Intent.ACTION_SEND || intent.type?.startsWith("text/") != true) {
      return null
    }
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString() ?: ""
    val id = intent.getStringExtra(SHARE_ID_EXTRA) ?: UUID.randomUUID().toString()
    intent.putExtra(SHARE_ID_EXTRA, id)
    return mapOf("id" to id, "text" to text)
  }
}
