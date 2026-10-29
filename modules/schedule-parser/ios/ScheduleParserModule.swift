import ExpoModulesCore
import UIKit
import Vision

public class ScheduleParserModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScheduleParser")

    AsyncFunction("parsePhoto") { (photoPath: String, prompt: String) async -> [String: String] in
      let text = (try? Self.recognizeText(photoPath)) ?? ""
      let structured = await Self.structure(text: text, prompt: prompt)
      return ["text": text, "model": structured.0, "eventsJson": structured.1]
    }
  }

  static func recognizeText(_ photoPath: String) throws -> String {
    let fileURL = photoURL(photoPath)
    guard let image = UIImage(contentsOfFile: fileURL.path) else { return "" }
    let upright = normalized(image)
    guard let cgImage = upright.cgImage else { return "" }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    try handler.perform([request])
    let observations = request.results ?? []
    let sorted = observations.sorted { lhs, rhs in
      let delta = lhs.boundingBox.midY - rhs.boundingBox.midY
      if abs(delta) > 0.015 { return delta > 0 }
      return lhs.boundingBox.minX < rhs.boundingBox.minX
    }
    return sorted.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
  }

  static func structure(text: String, prompt: String) async -> (String, String) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return ("none", "[]") }
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      return await structureWithApple(text: clip(trimmed), prompt: prompt)
    }
    #endif
    return ("none", "[]")
  }

  static func photoURL(_ photoPath: String) -> URL {
    if photoPath.hasPrefix("file://"), let url = URL(string: photoPath) { return url }
    return URL(fileURLWithPath: photoPath)
  }

  static func normalized(_ image: UIImage) -> UIImage {
    if image.imageOrientation == .up { return image }
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = image.scale
    let renderer = UIGraphicsImageRenderer(size: image.size, format: format)
    return renderer.image { _ in
      image.draw(in: CGRect(origin: .zero, size: image.size))
    }
  }

  static func clip(_ text: String) -> String {
    if text.count <= 8000 { return text }
    return String(text.prefix(8000))
  }
}

#if canImport(FoundationModels)
import FoundationModels

@available(iOS 26.0, *)
@Generable
struct ScheduleDraftList {
  @Guide(description: "Only events that appear in the flyer text. Never invent one.")
  var events: [ScheduleDraftItem]
}

@available(iOS 26.0, *)
@Generable
struct ScheduleDraftItem {
  @Guide(description: "Opponent or title copied from the same row")
  var title: String
  @Guide(description: "Start as ISO 8601. If the year is missing, the next upcoming date.")
  var start: String
  @Guide(description: "End as ISO 8601. One hour after the start when the row has no end. Same as start when the time is TBD.")
  var end: String
  @Guide(description: "Field or location from the same row, or empty")
  var location: String
  @Guide(description: "From 0 to 1. Below 0.5 when the time is TBD or missing.")
  var confidence: Double
  @Guide(description: "The original row text")
  var rawText: String
}

@available(iOS 26.0, *)
func structureWithApple(text: String, prompt: String) async -> (String, String) {
  switch SystemLanguageModel.default.availability {
  case .available:
    break
  default:
    return ("none", "[]")
  }
  let session = LanguageModelSession(instructions: "Extract schedule events from flyer text. Never invent an event.")
  do {
    let response = try await session.respond(
      to: prompt + "\n\nFlyer text:\n" + text,
      generating: ScheduleDraftList.self
    )
    let payload: [[String: Any]] = response.content.events.map { event in
      [
        "title": event.title,
        "start": event.start,
        "end": event.end,
        "location": event.location,
        "confidence": event.confidence,
        "rawText": event.rawText,
      ]
    }
    let data = try JSONSerialization.data(withJSONObject: payload)
    return ("foundation", String(data: data, encoding: .utf8) ?? "[]")
  } catch {
    return ("none", "[]")
  }
}
#endif
