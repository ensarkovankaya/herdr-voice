// app/macos/Sources/HerdrVoiceBar/MenuBarController.swift
import AppKit
import HerdrVoiceKit

// Boxes a pane + chosen override for NSMenuItem.representedObject.
private final class PaneChoice: NSObject {
    let pane: String
    let overrideValue: String?
    init(pane: String, overrideValue: String?) { self.pane = pane; self.overrideValue = overrideValue }
}

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
    private let onSetPaneOverride: (String, String?) -> Void

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
         onRestartService: @escaping () -> Void,
         onSetPaneOverride: @escaping (String, String?) -> Void) {
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
        self.onSetPaneOverride = onSetPaneOverride
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

        let headline = StatusSummary.statusHeadline(
            connected: state.connected, enabled: state.enabled, audioMuted: state.audioMuted)
        let statusColor: NSColor =
            !state.connected ? .systemRed :
            !state.enabled ? .systemGray :
            state.audioMuted ? .systemOrange : .systemGreen
        let statusLine = NSMenuItem(title: headline, action: nil, keyEquivalent: "")
        statusLine.attributedTitle = MenuStyle.twoLine(
            headline,
            StatusSummary.statusDetail(providers: state.tts.providers, summarizeMode: state.summarize.mode))
        statusLine.image = MenuStyle.dot(statusColor)
        statusLine.isEnabled = false
        menu.addItem(statusLine)

        let toggle = NSMenuItem(title: state.enabled ? "Duraklat" : "Aktifleştir",
                                action: #selector(toggleClicked), keyEquivalent: "")
        toggle.target = self
        toggle.isEnabled = state.connected
        toggle.image = MenuStyle.symbol(state.enabled ? "pause.fill" : "play.fill")
        menu.addItem(toggle)

        if state.summarize.mode == "claude" && state.summarize.authBroken {
            let warn = NSMenuItem(title: StatusSummary.summarizeAuthWarning, action: nil, keyEquivalent: "")
            warn.isEnabled = false
            menu.addItem(warn)
        }

        if let remoteText = StatusSummary.remoteLine(state.remote) {
            let r = NSMenuItem(title: remoteText, action: nil, keyEquivalent: "")
            r.attributedTitle = MenuStyle.secondary(remoteText)
            r.image = MenuStyle.symbol("antenna.radiowaves.left.and.right")
            r.isEnabled = false
            menu.addItem(r)
        }

        menu.addItem(.separator())
        menu.addItem(MenuStyle.sectionHeader("Son Mesajlar"))

        let now = Date()
        let recent = Array(state.messages.suffix(15).reversed())
        if recent.isEmpty {
            let empty = NSMenuItem(title: "Henüz mesaj yok", action: nil, keyEquivalent: "")
            empty.attributedTitle = MenuStyle.secondary("Henüz mesaj yok")
            empty.isEnabled = false
            menu.addItem(empty)
        } else {
            for msg in recent {
                let when = RelativeTime.short(fromISO: msg.ts, now: now)
                let subtitle = StatusSummary.messageSubtitle(
                    sessionTitle: msg.sessionTitle, sessionId: msg.sessionId,
                    workspaceName: msg.workspaceName ?? "", tabName: msg.tabName ?? "",
                    pane: msg.pane, relative: when)
                let text = String(msg.text.prefix(60))
                let item = NSMenuItem(title: text, action: nil, keyEquivalent: "")
                item.attributedTitle = MenuStyle.twoLine(text, subtitle)
                item.image = MenuStyle.dot(msg.kind == "cue" ? .systemOrange : .systemGreen, diameter: 7)
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

        if !state.panes.isEmpty {
            let panesItem = NSMenuItem(title: "Pane sesleri", action: nil, keyEquivalent: "")
            panesItem.image = MenuStyle.symbol("terminal")
            let panesMenu = NSMenu()
            for p in state.panes {
                let paneItem = NSMenuItem(title: StatusSummary.paneLabel(p), action: nil, keyEquivalent: "")
                let sub = NSMenu()
                let choices: [(String?, String)] = [(nil, "Varsayılan"), ("on", "Açık"), ("off", "Kapalı")]
                for (value, title) in choices {
                    let o = NSMenuItem(title: title, action: #selector(paneOverrideClicked(_:)), keyEquivalent: "")
                    o.target = self
                    o.representedObject = PaneChoice(pane: p.pane, overrideValue: value)
                    o.state = (p.override == value) ? .on : .off
                    sub.addItem(o)
                }
                paneItem.submenu = sub
                panesMenu.addItem(paneItem)
            }
            panesItem.submenu = panesMenu
            menu.addItem(panesItem)
        }

        menu.addItem(.separator())
        let settingsItem = NSMenuItem(title: "Ayarlar", action: nil, keyEquivalent: "")
        settingsItem.image = MenuStyle.symbol("gearshape")
        let settingsMenu = NSMenu()

        let launch = NSMenuItem(title: "Girişte Başlat",
                                action: #selector(toggleLaunchClicked), keyEquivalent: "")
        launch.target = self
        launch.state = launchAtLoginEnabled() ? .on : .off
        launch.image = MenuStyle.symbol("power")
        settingsMenu.addItem(launch)

        let audio = NSMenuItem(title: "Sesli oku", action: #selector(toggleAudioClicked), keyEquivalent: "")
        audio.target = self
        audio.state = state.audioMuted ? .off : .on   // "Sesli oku" ON = audio plays (not muted)
        audio.image = MenuStyle.symbol("speaker.wave.2")
        settingsMenu.addItem(audio)

        let notifItem = NSMenuItem(title: "Bildirimler", action: nil, keyEquivalent: "")
        notifItem.image = MenuStyle.symbol("bell")
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
        openLogs.image = MenuStyle.symbol("doc.plaintext")
        settingsMenu.addItem(openLogs)
        let openConfig = NSMenuItem(title: "Config Dosyasını Aç", action: #selector(openConfigClicked), keyEquivalent: "")
        openConfig.target = self
        openConfig.image = MenuStyle.symbol("doc.badge.gearshape")
        settingsMenu.addItem(openConfig)
        let restart = NSMenuItem(title: "Servisi Yeniden Başlat", action: #selector(restartServiceClicked), keyEquivalent: "")
        restart.target = self
        restart.image = MenuStyle.symbol("arrow.clockwise")
        settingsMenu.addItem(restart)

        settingsItem.submenu = settingsMenu
        menu.addItem(settingsItem)

        menu.addItem(.separator())
        // Bundle version (set by build-app.sh from package.json); absent when
        // running the bare executable in development — then the row is skipped.
        if let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String, !v.isEmpty {
            let version = NSMenuItem(title: "herdr-voice v\(v)", action: nil, keyEquivalent: "")
            version.attributedTitle = MenuStyle.secondary("herdr-voice v\(v)")
            version.isEnabled = false
            menu.addItem(version)
        }
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

    @objc private func paneOverrideClicked(_ sender: NSMenuItem) {
        guard let c = sender.representedObject as? PaneChoice else { return }
        onSetPaneOverride(c.pane, c.overrideValue)
    }
}
