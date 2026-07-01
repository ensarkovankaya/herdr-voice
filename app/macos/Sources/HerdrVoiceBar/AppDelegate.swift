// app/macos/Sources/HerdrVoiceBar/AppDelegate.swift
import AppKit
import HerdrVoiceKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var state: AppState!
    private var controller: MenuBarController!
    private var client: RouterClient!
    private var sse: SSEClient?
    private let notifier = Notifier()
    private let settings = NotificationSettings()
    private var launchAtLogin: LaunchAtLogin!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = (try? AppConfig.load()) ?? AppConfig(host: "127.0.0.1", port: 8973, token: "")
        state = AppState()
        client = RouterClient(config: config)
        launchAtLogin = LaunchAtLogin(
            programPath: Bundle.main.executablePath ?? CommandLine.arguments.first ?? "")
        controller = MenuBarController(state: state, settings: settings,
            onToggle: { [weak self] in self?.toggle() },
            onSetMode: { [weak self] mode in
                guard let self else { return }
                var s = self.settings; s.mode = mode
                self.controller.rebuild()
            },
            launchAtLoginEnabled: { [weak self] in self?.launchAtLogin.isEnabled ?? false },
            onToggleLaunchAtLogin: { [weak self] in
                guard let self else { return }
                do {
                    if self.launchAtLogin.isEnabled { try self.launchAtLogin.disable() }
                    else { try self.launchAtLogin.enable() }
                } catch {
                    NSLog("herdr-voice: launch-at-login toggle failed: \(error)")
                }
                self.controller.rebuild()
            })
        state.onChange = { [weak self] in self?.controller.rebuild() }
        notifier.activate()
        state.onMessage = { [weak self] msg in
            guard let self else { return }
            let plan = NotificationPolicy.make(for: msg, mode: self.settings.mode)
            if let plan {
                self.notifier.post(plan)
            }
        }

        Task { await self.refreshState() }

        sse = SSEClient(
            config: config,
            onConnected: { [weak self] in Task { @MainActor in guard let self else { return }; self.state.setConnected(true); await self.refreshState() } },
            onDisconnected: { [weak self] in Task { @MainActor in self?.state.setConnected(false) } },
            onEvent: { [weak self] event in Task { @MainActor in self?.state.handle(event) } }
        )
        sse?.start()
    }

    func applicationWillTerminate(_ notification: Notification) {
        sse?.stop()
    }

    private func refreshState() async {
        if let s = try? await client.fetchState() {
            state.apply(s)
            state.setConnected(true)
        }
    }

    private func toggle() {
        Task {
            _ = try? await client.toggle()
            await refreshState()
        }
    }
}
