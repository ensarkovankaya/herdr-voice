// app/macos/Sources/HerdrVoiceBar/LoginItemManager.swift
import Foundation
import ServiceManagement
import HerdrVoiceKit

// Login-item management. SMAppService (macOS 13+) is the primary backend — it
// shows up in System Settings › General › Login Items and needs no plist. The
// legacy LaunchAgent plist (LaunchAtLogin) remains as a fallback for signing
// situations where SMAppService registration fails, and for migrating installs
// that predate this manager.
@MainActor
final class LoginItemManager {
    private let legacy: LaunchAtLogin

    init(legacy: LaunchAtLogin) { self.legacy = legacy }

    var isEnabled: Bool {
        SMAppService.mainApp.status == .enabled || legacy.isEnabled
    }

    // One-time startup migration: an older install enabled login via the
    // LaunchAgent plist. If SMAppService can take over, register and delete
    // the plist so the app isn't launched twice at the next login.
    func migrateIfNeeded() {
        guard legacy.isEnabled else { return }
        do {
            try SMAppService.mainApp.register()
            guard SMAppService.mainApp.status == .enabled else {
                // Pending user approval in System Settings — keep the LaunchAgent
                // until the SMAppService item is actually active; we retry at the
                // next launch and migrate once it is approved.
                NSLog("herdr-voice: SMAppService login item requires approval; keeping LaunchAgent for now")
                return
            }
            try legacy.disable()
            NSLog("herdr-voice: login item migrated LaunchAgent → SMAppService")
        } catch {
            NSLog("herdr-voice: SMAppService migration failed, keeping LaunchAgent: \(error)")
        }
    }

    func toggle() {
        if isEnabled {
            let status = SMAppService.mainApp.status
            if status == .enabled || status == .requiresApproval {
                do { try SMAppService.mainApp.unregister() }
                catch { NSLog("herdr-voice: SMAppService unregister failed: \(error)") }
            }
            try? legacy.disable()
        } else {
            do {
                try SMAppService.mainApp.register()
                if SMAppService.mainApp.status == .requiresApproval {
                    NSLog("herdr-voice: login item registered — approval needed in System Settings › Login Items")
                }
            }
            catch {
                NSLog("herdr-voice: SMAppService register failed, falling back to LaunchAgent: \(error)")
                try? legacy.enable()
            }
        }
    }
}
