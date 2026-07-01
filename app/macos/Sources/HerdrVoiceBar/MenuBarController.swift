// app/macos/Sources/HerdrVoiceBar/MenuBarController.swift
import AppKit
import HerdrVoiceKit

// Owns the NSStatusItem and rebuilds its NSMenu from AppState on every change.
@MainActor
final class MenuBarController {
    private let statusItem: NSStatusItem
    private let state: AppState
    private let onToggle: () -> Void

    init(state: AppState, onToggle: @escaping () -> Void) {
        self.state = state
        self.onToggle = onToggle
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        rebuild()
    }

    private func icon() -> NSImage? {
        let name: String
        if !state.connected { name = "exclamationmark.triangle" }
        else if state.enabled { name = "speaker.wave.2" }
        else { name = "speaker.slash" }
        let img = NSImage(systemSymbolName: name, accessibilityDescription: "herdr-voice")
        img?.isTemplate = true
        return img
    }

    func rebuild() {
        statusItem.button?.image = icon()
        let menu = NSMenu()

        let statusLine = NSMenuItem(
            title: state.connected ? (state.enabled ? "● Ses AÇIK" : "○ Ses KAPALI") : "⚠︎ Bağlantı yok",
            action: nil, keyEquivalent: "")
        statusLine.isEnabled = false
        menu.addItem(statusLine)

        let toggle = NSMenuItem(title: state.enabled ? "Sesi kapat" : "Sesi aç",
                                action: #selector(toggleClicked), keyEquivalent: "")
        toggle.target = self
        toggle.isEnabled = state.connected
        menu.addItem(toggle)

        if state.remote.present {
            let r = NSMenuItem(title: "Remote: \(state.remote.ip ?? "aktif")", action: nil, keyEquivalent: "")
            r.isEnabled = false
            menu.addItem(r)
        }

        menu.addItem(.separator())
        let header = NSMenuItem(title: "Son mesajlar", action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)

        let now = Date()
        let recent = Array(state.messages.suffix(15).reversed())
        if recent.isEmpty {
            let empty = NSMenuItem(title: "  (henüz yok)", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            menu.addItem(empty)
        } else {
            var lastSession = "\u{0}"
            for msg in recent {
                let session = msg.sessionTitle.isEmpty ? (msg.sessionId.isEmpty ? "?" : msg.sessionId) : msg.sessionTitle
                if session != lastSession {
                    let s = NSMenuItem(title: session, action: nil, keyEquivalent: "")
                    s.isEnabled = false
                    menu.addItem(s)
                    lastSession = session
                }
                let bullet = msg.kind == "cue" ? "🟠" : "🟢"
                let when = RelativeTime.short(fromISO: msg.ts, now: now)
                let line = "  \(bullet) \(msg.text.prefix(60))\(when.isEmpty ? "" : "  · \(when)")"
                let item = NSMenuItem(title: line, action: nil, keyEquivalent: "")
                item.isEnabled = false
                menu.addItem(item)
            }
        }

        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Çıkış", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        statusItem.menu = menu
    }

    @objc private func toggleClicked() { onToggle() }
}
