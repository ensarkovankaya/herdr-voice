// app/macos/Sources/HerdrVoiceBar/AppDelegate.swift
import AppKit
import HerdrVoiceKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var state: AppState!
    private var controller: MenuBarController!
    private var client: RouterClient!
    private var streamTask: Task<Void, Never>?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = (try? AppConfig.load()) ?? AppConfig(host: "127.0.0.1", port: 8973, token: "")
        state = AppState()
        client = RouterClient(config: config)
        controller = MenuBarController(state: state) { [weak self] in self?.toggle() }
        state.onChange = { [weak self] in self?.controller.rebuild() }

        Task { await self.refreshState() }
        startStream()
    }

    func applicationWillTerminate(_ notification: Notification) {
        streamTask?.cancel()
    }

    private func refreshState() async {
        if let s = try? await client.fetchState() {
            state.apply(s)
            state.setConnected(true)
        }
    }

    private func startStream() {
        streamTask = Task { [weak self] in
            guard let self else { return }
            await self.client.stream(
                onConnected: { Task { @MainActor in self.state.setConnected(true); await self.refreshState() } },
                onDisconnected: { Task { @MainActor in self.state.setConnected(false) } },
                onEvent: { event in Task { @MainActor in self.state.handle(event) } }
            )
        }
    }

    private func toggle() {
        Task {
            _ = try? await client.toggle()
            await refreshState()
        }
    }
}
