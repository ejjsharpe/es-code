// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.
// Generate the ES Code app icon. Run with: swift resources/darwin/generate-es-code-icon.swift
import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let destination = root.appendingPathComponent("resources/darwin/code.icns")
let artworkURL = root.appendingPathComponent("resources/es-code-icon-source.png")
let temporary = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("es-code-icon-\(UUID().uuidString)")
try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)

let size = 1024
guard let artwork = NSImage(contentsOf: artworkURL), artwork.size == NSSize(width: 1254, height: 1254) else {
    fatalError("Expected the 1254px ES Code artwork at \(artworkURL.path)")
}
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()

// Crop the outer canvas and keep transparent corners around the supplied tile.
NSGraphicsContext.saveGraphicsState()
let tile = NSBezierPath(roundedRect: NSRect(x: 26, y: 26, width: 972, height: 972), xRadius: 190, yRadius: 190)
tile.addClip()
artwork.draw(
    in: NSRect(x: 0, y: 0, width: size, height: size),
    from: NSRect(x: 250, y: 237, width: 754, height: 754),
    operation: .copy,
    fraction: 1
)
NSGraphicsContext.restoreGraphicsState()
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
func resizedPNG(_ pixels: Int, at output: URL) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/sips")
    process.arguments = ["-z", String(pixels), String(pixels), source.path, "--out", output.path]
    process.standardOutput = FileHandle.nullDevice
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { fatalError("sips failed for \(output.path)") }
}

for (name, pixels) in variants {
    try resizedPNG(pixels, at: temporary.appendingPathComponent(name))
}

func appendBigEndian(_ value: Int, to data: inout Data) {
    data.append(contentsOf: [UInt8((value >> 24) & 0xff), UInt8((value >> 16) & 0xff), UInt8((value >> 8) & 0xff), UInt8(value & 0xff)])
}

func appendLittleEndian(_ value: Int, bytes: Int, to data: inout Data) {
    for shift in stride(from: 0, to: bytes * 8, by: 8) {
        data.append(UInt8((value >> shift) & 0xff))
    }
}

// Store PNG chunks directly so the generated icns does not depend on iconutil.
let macChunks = [
    ("icp4", "icon_16x16.png"), ("icp5", "icon_32x32.png"),
    ("icp6", "icon_32x32@2x.png"), ("ic07", "icon_128x128.png"),
    ("ic08", "icon_256x256.png"), ("ic09", "icon_512x512.png"),
    ("ic10", "icon_512x512@2x.png")
]
var icns = Data("icns".utf8)
let icnsLength = try macChunks.reduce(8) { total, chunk in
    total + 8 + (try Data(contentsOf: temporary.appendingPathComponent(chunk.1))).count
}
appendBigEndian(icnsLength, to: &icns)
for (type, name) in macChunks {
    let png = try Data(contentsOf: temporary.appendingPathComponent(name))
    icns.append(contentsOf: type.utf8)
    appendBigEndian(8 + png.count, to: &icns)
    icns.append(png)
}
try icns.write(to: destination)

// Small ICO entries use a bitmap for Windows shell compatibility; 256px uses PNG.
func bitmapIconData(_ png: Data, size: Int) -> Data {
    guard let bitmap = NSBitmapImageRep(data: png) else { fatalError("Unable to read \(size)px icon") }
    let maskStride = ((size + 31) / 32) * 4
    var dib = Data()
    for value in [40, size, size * 2] {
        appendLittleEndian(value, bytes: 4, to: &dib)
    }
    appendLittleEndian(1, bytes: 2, to: &dib)
    appendLittleEndian(32, bytes: 2, to: &dib)
    for value in [0, size * size * 4 + maskStride * size, 0, 0, 0, 0] {
        appendLittleEndian(value, bytes: 4, to: &dib)
    }
    for y in (0..<size).reversed() {
        for x in 0..<size {
            guard let pixel = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { fatalError("Unable to read pixel") }
            dib.append(contentsOf: [pixel.blueComponent, pixel.greenComponent, pixel.redComponent, pixel.alphaComponent].map {
                UInt8((min(max($0, 0), 1) * 255).rounded())
            })
        }
    }
    for y in (0..<size).reversed() {
        var mask = [UInt8](repeating: 0, count: maskStride)
        for x in 0..<size {
            if (bitmap.colorAt(x: x, y: y)?.alphaComponent ?? 0) < 0.5 {
                mask[x / 8] |= 0x80 >> (x % 8)
            }
        }
        dib.append(contentsOf: mask)
    }
    return dib
}

func writeICO(_ sizes: [Int], to destination: URL) throws {
    let images = try sizes.map { size -> Data in
        let output = temporary.appendingPathComponent("windows-\(size).png")
        try resizedPNG(size, at: output)
        let png = try Data(contentsOf: output)
        return size == 256 ? png : bitmapIconData(png, size: size)
    }
    var ico = Data()
    appendLittleEndian(0, bytes: 2, to: &ico)
    appendLittleEndian(1, bytes: 2, to: &ico)
    appendLittleEndian(sizes.count, bytes: 2, to: &ico)
    var offset = 6 + sizes.count * 16
    for (index, size) in sizes.enumerated() {
        ico.append(UInt8(size == 256 ? 0 : size))
        ico.append(UInt8(size == 256 ? 0 : size))
        ico.append(contentsOf: [0, 0])
        appendLittleEndian(1, bytes: 2, to: &ico)
        appendLittleEndian(32, bytes: 2, to: &ico)
        appendLittleEndian(images[index].count, bytes: 4, to: &ico)
        appendLittleEndian(offset, bytes: 4, to: &ico)
        offset += images[index].count
    }
    for image in images {
        ico.append(image)
    }
    try ico.write(to: destination)
}

try png.write(to: root.appendingPathComponent("resources/linux/code.png"))
try resizedPNG(512, at: root.appendingPathComponent("resources/server/code-512.png"))
try resizedPNG(192, at: root.appendingPathComponent("resources/server/code-192.png"))
try resizedPNG(150, at: root.appendingPathComponent("resources/win32/code_150x150.png"))
try resizedPNG(70, at: root.appendingPathComponent("resources/win32/code_70x70.png"))
try writeICO([16, 32, 48, 256], to: root.appendingPathComponent("resources/win32/code.ico"))
try writeICO([16, 32, 48], to: root.appendingPathComponent("resources/server/favicon.ico"))

try FileManager.default.removeItem(at: temporary)
print("Generated ES Code icons in resources/darwin, resources/linux, resources/win32, and resources/server")
