import Foundation

public enum NotificationMode: String, CaseIterable, Sendable {
    case all, approvals, off
}

public struct NotificationPlan: Equatable, Sendable {
    public let title: String
    public let body: String
    public let isApproval: Bool
    public let pane: String
    public init(title: String, body: String, isApproval: Bool, pane: String) {
        self.title = title; self.body = body; self.isApproval = isApproval; self.pane = pane
    }
}

public enum NotificationPolicy {
    // Decide whether to notify for this utterance under `mode`, and build the
    // notification content. Returns nil to skip.
    public static func make(for msg: Message, mode: NotificationMode) -> NotificationPlan? {
        switch mode {
        case .off: return nil
        case .approvals: if msg.kind != "cue" { return nil }
        case .all: break
        }
        let title = !msg.sessionTitle.isEmpty ? msg.sessionTitle
            : (!msg.sessionId.isEmpty ? msg.sessionId : "herdr-voice")
        return NotificationPlan(title: title, body: msg.text, isApproval: msg.kind == "cue", pane: msg.pane)
    }
}
