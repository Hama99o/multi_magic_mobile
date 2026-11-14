package expo.modules.sensitiveclipboard

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.PersistableBundle
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Copies text marked SENSITIVE, so Android 13+ does not show it in the
 * clipboard preview over other apps (SafeZone, `SECURITY.md` §6/§9;
 * developer.android.com/develop/ui/views/touch-and-input/copy-paste#SensitiveContent).
 * `expo-clipboard` 57 has no option for it. Below API 33 the same extra is
 * set by its literal name, as the platform guide suggests; it is ignored there.
 */
class SensitiveClipboardModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SensitiveClipboard")

    AsyncFunction("setSensitiveStringAsync") { text: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("no React context")
      val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      val clip = ClipData.newPlainText("", text)
      clip.description.extras = PersistableBundle().apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true)
        } else {
          putBoolean("android.content.extra.IS_SENSITIVE", true)
        }
      }
      manager.setPrimaryClip(clip)
      true
    }
  }
}
