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
    let lines: [(text: String, midY: CGFloat, minX: CGFloat, height: CGFloat)] = observations.compactMap { observation in
      guard let text = observation.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines),
            !text.isEmpty else { return nil }
      let box = observation.boundingBox
      return (text, box.midY, box.minX, max(box.height, 0.01))
    }
    let sorted = lines.sorted { lhs, rhs in
      if abs(lhs.midY - rhs.midY) > 0.0001 { return lhs.midY > rhs.midY }
      return lhs.minX < rhs.minX
    }
    var rows: [[(text: String, midY: CGFloat, minX: CGFloat, height: CGFloat)]] = []
    for line in sorted {
      if let row = rows.last {
        let count = CGFloat(row.count)
        let averageY = row.reduce(CGFloat(0)) { $0 + $1.midY } / count
        let averageH = row.reduce(CGFloat(0)) { $0 + $1.height } / count
        if abs(line.midY - averageY) <= 0.6 * averageH {
          var next = row
          next.append(line)
          rows[rows.count - 1] = next
          continue
        }
      }
      rows.append([line])
    }
    return rows.map { row in
      row.sorted { $0.minX < $1.minX }.map { $0.text }.joined(separator: " | ")
    }.joined(separator: "\n")
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
  @Guide(description: "Start as ISO 8601. If a weekday is named, use the year where that date falls on it. Otherwise the next upcoming date, keeping dates up to 60 days in the past.")
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
