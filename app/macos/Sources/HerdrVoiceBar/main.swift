// app/macos/Sources/HerdrVoiceBar/main.swift
import AppKit

let app = NSApplication.shared
app.setActivationPolicy(.accessory)   // menu bar agent, no dock icon
let delegate = AppDelegate()
app.delegate = delegate
app.run()
