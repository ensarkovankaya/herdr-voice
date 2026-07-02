// app/macos/Sources/HerdrVoiceBar/MenuBarController.swift
import AppKit
import HerdrVoiceKit

// Owns the NSStatusItem and rebuilds its NSMenu from AppState on every change.
@MainActor
final class MenuBarController {
    private let statusItem: NSStatusItem
    private let state: AppState
    private let onToggle: () -> Void
    private let settings: NotificationSettings
    private let onSetMode: (NotificationMode) -> Void
    private let launchAtLoginEnabled: () -> Bool
    private let onToggleLaunchAtLogin: () -> Void
    private let onToggleAudio: () -> Void
    private let onReplay: (String) -> Void
    private let onCopy: (String) -> Void
    private let onOpenLogs: () -> Void
    private let onOpenConfig: () -> Void
    private let onRestartService: () -> Void

    init(state: AppState, settings: NotificationSettings,
         onToggle: @escaping () -> Void,
         onSetMode: @escaping (NotificationMode) -> Void,
         launchAtLoginEnabled: @escaping () -> Bool,
         onToggleLaunchAtLogin: @escaping () -> Void,
         onToggleAudio: @escaping () -> Void,
         onReplay: @escaping (String) -> Void,
         onCopy: @escaping (String) -> Void,
         onOpenLogs: @escaping () -> Void,
         onOpenConfig: @escaping () -> Void,
         onRestartService: @escaping () -> Void) {
        self.state = state
        self.settings = settings
        self.onToggle = onToggle
        self.onSetMode = onSetMode
        self.launchAtLoginEnabled = launchAtLoginEnabled
        self.onToggleLaunchAtLogin = onToggleLaunchAtLogin
        self.onToggleAudio = onToggleAudio
        self.onReplay = onReplay
        self.onCopy = onCopy
        self.onOpenLogs = onOpenLogs
        self.onOpenConfig = onOpenConfig
        self.onRestartService = onRestartService
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        rebuild()
    }

    private func icon() -> NSImage? {
        let name: String
        if !state.connected { name = "exclamationmark.triangle" }
        else if !state.enabled { name = "speaker.slash" }
        else if state.audioMuted { name = "bell" }   // active, notifications only
        else { name = "speaker.wave.2" }
        let img = NSImage(systemSymbolName: name, accessibilityDescription: "herdr-voice")
        img?.isTemplate = true
        return img
    }

    func rebuild() {
        statusItem.button?.image = icon()
        let menu = NSMenu()

        let statusTitle: String
        if !state.connected { statusTitle = "⚠︎ Bağlantı yok" }
        else if !state.enabled { statusTitle = "○ Duraklatıldı" }
        else if state.audioMuted { statusTitle = "🔔 Sadece bildirim" }
        else { statusTitle = "● Aktif" }
        let statusLine = NSMenuItem(title: statusTitle, action: nil, keyEquivalent: "")
        statusLine.isEnabled = false
        menu.addItem(statusLine)

        let toggle = NSMenuItem(title: state.enabled ? "Duraklat" : "Aktifleştir",
                                action: #selector(toggleClicked), keyEquivalent: "")
        toggle.target = self
        toggle.isEnabled = state.connected
        menu.addItem(toggle)

        let providerRow = NSMenuItem(
            title: StatusSummary.providerLine(providers: state.tts.providers),
            action: nil, keyEquivalent: "")
        providerRow.isEnabled = false
        menu.addItem(providerRow)

        let summarizeRow = NSMenuItem(
            title: StatusSummary.summarizeLine(mode: state.summarize.mode),
            action: nil, keyEquivalent: "")
        summarizeRow.isEnabled = false
        menu.addItem(summarizeRow)

        if state.summarize.mode == "claude" && state.summarize.authBroken {
            let warn = NSMenuItem(title: StatusSummary.summarizeAuthWarning, action: nil, keyEquivalent: "")
            warn.isEnabled = false
            menu.addItem(warn)
        }

        if let remoteText = StatusSummary.remoteLine(state.remote) {
            let r = NSMenuItem(title: remoteText, action: nil, keyEquivalent: "")
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
                let actions = NSMenu()
                let replay = NSMenuItem(title: "Yeniden seslendir", action: #selector(replayClicked(_:)), keyEquivalent: "")
                replay.target = self
                replay.representedObject = msg.id
                actions.addItem(replay)
                let copy = NSMenuItem(title: "Kopyala", action: #selector(copyClicked(_:)), keyEquivalent: "")
                copy.target = self
                copy.representedObject = msg.text
                actions.addItem(copy)
                item.submenu = actions
                menu.addItem(item)
            }
        }

        menu.addItem(.separator())
        let settingsItem = NSMenuItem(title: "Ayarlar", action: nil, keyEquivalent: "")
        let settingsMenu = NSMenu()

        let launch = NSMenuItem(title: "Girişte Başlat",
                                action: #selector(toggleLaunchClicked), keyEquivalent: "")
        launch.target = self
        launch.state = launchAtLoginEnabled() ? .on : .off
        settingsMenu.addItem(launch)

        let audio = NSMenuItem(title: "Sesli oku", action: #selector(toggleAudioClicked), keyEquivalent: "")
        audio.target = self
        audio.state = state.audioMuted ? .off : .on   // "Sesli oku" ON = audio plays (not muted)
        settingsMenu.addItem(audio)

        let notifItem = NSMenuItem(title: "Bildirimler", action: nil, keyEquivalent: "")
        let notifMenu = NSMenu()
        let current = settings.mode
        let modes: [(NotificationMode, String)] = [(.all, "Tümü"), (.approvals, "Sadece onay"), (.off, "Kapalı")]
        for (mode, label) in modes {
            let item = NSMenuItem(title: label, action: #selector(setModeClicked(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = mode.rawValue
            item.state = (mode == current) ? .on : .off
            notifMenu.addItem(item)
        }
        notifItem.submenu = notifMenu
        settingsMenu.addItem(notifItem)

        settingsMenu.addItem(.separator())
        let openLogs = NSMenuItem(title: "Logları Aç", action: #selector(openLogsClicked), keyEquivalent: "")
        openLogs.target = self
        settingsMenu.addItem(openLogs)
        let openConfig = NSMenuItem(title: "Config Dosyasını Aç", action: #selector(openConfigClicked), keyEquivalent: "")
        openConfig.target = self
        settingsMenu.addItem(openConfig)
        let restart = NSMenuItem(title: "Servisi Yeniden Başlat", action: #selector(restartServiceClicked), keyEquivalent: "")
        restart.target = self
        settingsMenu.addItem(restart)

        settingsItem.submenu = settingsMenu
        menu.addItem(settingsItem)

        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Çıkış", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        statusItem.menu = menu
    }

    @objc private func toggleClicked() { onToggle() }

    @objc private func toggleLaunchClicked() { onToggleLaunchAtLogin() }

    @objc private func toggleAudioClicked() { onToggleAudio() }

    @objc private func setModeClicked(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let mode = NotificationMode(rawValue: raw) else { return }
        onSetMode(mode)
    }

    @objc private func replayClicked(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String else { return }
        onReplay(id)
    }

    @objc private func copyClicked(_ sender: NSMenuItem) {
        guard let text = sender.representedObject as? String else { return }
        onCopy(text)
    }

    @objc private func openLogsClicked() { onOpenLogs() }
    @objc private func openConfigClicked() { onOpenConfig() }
    @objc private func restartServiceClicked() { onRestartService() }
}
