package expo.modules.scheduleparser

import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class ScheduleParserModule : Module() {
  private val scope = CoroutineScope(Dispatchers.IO)

  override fun definition() = ModuleDefinition {
    Name("ScheduleParser")

    AsyncFunction("parsePhoto") { photoPath: String, prompt: String, promise: Promise ->
      scope.launch {
        val text = try {
          recognize(photoPath)
        } catch (ignored: Throwable) {
          ""
        }
        val structured = try {
          structure(text, prompt)
        } catch (ignored: Throwable) {
          "none" to "[]"
        }
        promise.resolve(
          mapOf(
            "text" to text,
            "model" to structured.first,
            "eventsJson" to structured.second,
          ),
        )
      }
    }
  }

  private fun recognize(photoPath: String): String {
    val context = appContext.reactContext ?: return ""
    val uri = when {
      photoPath.startsWith("content://") || photoPath.startsWith("file://") -> Uri.parse(photoPath)
      else -> Uri.fromFile(File(photoPath))
    }
    val image = InputImage.fromFilePath(context, uri)
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    return try {
      Tasks.await(recognizer.process(image)).text ?: ""
    } finally {
      recognizer.close()
    }
  }

  private suspend fun structure(text: String, prompt: String): Pair<String, String> {
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return "none" to "[]"
    val clipped = if (trimmed.length > 8000) trimmed.substring(0, 8000) else trimmed
    val generativeModel = com.google.mlkit.genai.prompt.Generation.getClient()
    val status = generativeModel.checkStatus()
    if (status != com.google.mlkit.genai.common.FeatureStatus.AVAILABLE) return "none" to "[]"
    val response = generativeModel.generateContent("$prompt\n\nFlyer text:\n$clipped")
    val raw = response.text?.trim().orEmpty()
    if (raw.isEmpty()) return "none" to "[]"
    return "nano" to extractJsonArray(raw)
  }

  private fun extractJsonArray(raw: String): String {
    val start = raw.indexOf('[')
    val end = raw.lastIndexOf(']')
    if (start < 0 || end <= start) return "[]"
    return raw.substring(start, end + 1)
  }
}
