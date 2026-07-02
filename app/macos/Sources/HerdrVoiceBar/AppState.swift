// app/macos/Sources/HerdrVoiceBar/AppState.swift
import Foundation
import HerdrVoiceKit

// Single source of UI truth, mutated on the main actor. `onChange` fires after
// every mutation so the menu can rebuild.
@MainActor
final class AppState {
    private(set) var enabled = false
    private(set) var audioMuted = false
    private(set) var remote = RemoteState(present: false, ip: nil, port: nil, expiresAt: nil)
    private(set) var tts = TtsState(providers: [])
    private(set) var summarize = SummarizeState(mode: "", authBroken: false)
    private(set) var messages: [Message] = []   // newest last (ring-buffer order)
    private(set) var connected = false
    var onChange: (() -> Void)?
    var onMessage: ((Message) -> Void)?
    var onSummarizeAuthAlert: (() -> Void)?

    private let maxMessages = 50

    func apply(_ state: RouterState) {
        enabled = state.enabled
        audioMuted = state.audioMuted
        remote = state.remote
        tts = state.tts
        updateSummarize(state.summarize)
        messages = state.messages
        onChange?()
    }

    func setConnected(_ value: Bool) {
        guard connected != value else { return }
        connected = value
        onChange?()
    }

    // Update the summarizer status; fire the alert only on a false→true
    // transition so the user gets ONE notification per login drop.
    private func updateSummarize(_ next: SummarizeState) {
        let wasBroken = summarize.authBroken
        summarize = next
        if !wasBroken && next.authBroken { onSummarizeAuthAlert?() }
    }

    // Apply one SSE event. Unknown events are ignored.
    func handle(_ event: SSEEvent) {
        guard let data = event.data.data(using: .utf8) else { return }
        switch event.name {
        case "speak":
            if let msg = try? RouterDecoder.message(data) {
                messages.append(msg)
                if messages.count > maxMessages { messages.removeFirst(messages.count - maxMessages) }
                onChange?()
                onMessage?(msg)
            }
        case "toggle":
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let e = obj["enabled"] as? Bool {
                enabled = e
                onChange?()
            }
        case "audio":
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let m = obj["audioMuted"] as? Bool {
                audioMuted = m
                onChange?()
            }
        case "summarize_auth":
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let b = obj["broken"] as? Bool {
                updateSummarize(SummarizeState(mode: summarize.mode, authBroken: b))
                onChange?()
            }
        case "register":
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                remote = RemoteState(present: true, ip: obj["ip"] as? String, port: obj["port"] as? Int, expiresAt: nil)
                onChange?()
            }
        case "deregister":
            remote = RemoteState(present: false, ip: nil, port: nil, expiresAt: nil)
            onChange?()
        default:
            break
        }
    }
}
