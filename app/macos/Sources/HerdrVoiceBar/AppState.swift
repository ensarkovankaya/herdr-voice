// app/macos/Sources/HerdrVoiceBar/AppState.swift
import Foundation
import HerdrVoiceKit

// Single source of UI truth, mutated on the main actor. `onChange` fires after
// every mutation so the menu can rebuild.
@MainActor
final class AppState {
    private(set) var enabled = false
    private(set) var remote = RemoteState(present: false, ip: nil, port: nil, expiresAt: nil)
    private(set) var messages: [Message] = []   // newest last (ring-buffer order)
    private(set) var connected = false
    var onChange: (() -> Void)?
    var onMessage: ((Message) -> Void)?

    private let maxMessages = 50

    func apply(_ state: RouterState) {
        enabled = state.enabled
        remote = state.remote
        messages = state.messages
        DebugLog.log("apply /state msgs=\(state.messages.count)")
        onChange?()
    }

    func setConnected(_ value: Bool) {
        guard connected != value else { return }
        connected = value
        DebugLog.log("connected=\(value)")
        onChange?()
    }

    // Apply one SSE event. Unknown events are ignored.
    func handle(_ event: SSEEvent) {
        DebugLog.log("handle event=\(event.name)")
        guard let data = event.data.data(using: .utf8) else { return }
        switch event.name {
        case "speak":
            if let msg = try? RouterDecoder.message(data) {
                messages.append(msg)
                if messages.count > maxMessages { messages.removeFirst(messages.count - maxMessages) }
                onChange?()
                DebugLog.log("speak: appended, onMessage set=\(onMessage != nil)")
                onMessage?(msg)
            } else {
                DebugLog.log("speak: DECODE FAILED")
            }
        case "toggle":
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let e = obj["enabled"] as? Bool {
                enabled = e
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
