// Generate a simple ES Code macOS icon. Run with: swift resources/darwin/generate-es-code-icon.swift
import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let destination = root.appendingPathComponent("resources/darwin/code.icns")
let temporary = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("es-code-icon-\(UUID().uuidString).iconset")
try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)

let size = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()

let base = NSBezierPath(roundedRect: NSRect(x: 40, y: 40, width: 944, height: 944), xRadius: 216, yRadius: 216)
NSColor(calibratedRed: 0.11, green: 0.15, blue: 0.21, alpha: 1).setFill()
base.fill()

let highlight = NSBezierPath(roundedRect: NSRect(x: 68, y: 68, width: 888, height: 888), xRadius: 190, yRadius: 190)
highlight.lineWidth = 8
NSColor(calibratedRed: 0.29, green: 0.38, blue: 0.48, alpha: 0.85).setStroke()
highlight.stroke()

let accent = NSBezierPath()
accent.move(to: NSPoint(x: 190, y: 250))
accent.line(to: NSPoint(x: 835, y: 250))
accent.lineWidth = 28
accent.lineCapStyle = .round
NSColor(calibratedRed: 0.37, green: 0.84, blue: 0.74, alpha: 1).setStroke()
accent.stroke()

let label = "ES" as NSString
let font = NSFont.systemFont(ofSize: 438, weight: .semibold)
let attributes: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: NSColor.white,
    .kern: -22
]
let textSize = label.size(withAttributes: attributes)
label.draw(at: NSPoint(x: (CGFloat(size) - textSize.width) / 2 - 2, y: 346), withAttributes: attributes)
image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Unable to draw the ES Code icon")
}
let source = temporary.appendingPathComponent("source.png")
try png.write(to: source)

let variants: [(String, Int)] = [
    ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024)
]
for (name, pixels) in variants {
    let output = temporary.appendingPathComponent(name)
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/sips")
    process.arguments = ["-z", String(pixels), String(pixels), source.path, "--out", output.path]
    process.standardOutput = FileHandle.nullDevice
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { fatalError("sips failed for \(name)") }
}
try FileManager.default.removeItem(at: source)

let iconutil = Process()
iconutil.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
iconutil.arguments = ["-c", "icns", temporary.path, "-o", destination.path]
try iconutil.run()
iconutil.waitUntilExit()
guard iconutil.terminationStatus == 0 else { fatalError("iconutil failed for \(temporary.path)") }
try FileManager.default.removeItem(at: temporary)
print(destination.path)
