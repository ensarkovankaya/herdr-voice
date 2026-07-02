import Foundation

public struct Message: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var ts: String
    public var text: String
    public var kind: String
    public var cueKind: String?
    public var sessionId: String
    public var sessionTitle: String
    public var workspace: String
    public var tab: String
    public var pane: String
    public var mode: String
    public var provider: String?
    public init(id: String, ts: String, text: String, kind: String, cueKind: String?, sessionId: String,
                sessionTitle: String, workspace: String, tab: String, pane: String, mode: String, provider: String?) {
        self.id = id; self.ts = ts; self.text = text; self.kind = kind; self.cueKind = cueKind
        self.sessionId = sessionId; self.sessionTitle = sessionTitle; self.workspace = workspace
        self.tab = tab; self.pane = pane; self.mode = mode; self.provider = provider
    }
}

public struct RemoteState: Codable, Equatable, Sendable {
    public var present: Bool
    public var ip: String?
    public var port: Int?
    public var expiresAt: Double?
    public init(present: Bool, ip: String?, port: Int?, expiresAt: Double?) {
        self.present = present; self.ip = ip; self.port = port; self.expiresAt = expiresAt
    }
}

public struct TtsState: Codable, Equatable, Sendable {
    public var providers: [String]
    public init(providers: [String]) {
        self.providers = providers
    }
}

public struct SummarizeState: Codable, Equatable, Sendable {
    public var mode: String
    public var authBroken: Bool
    public init(mode: String, authBroken: Bool) {
        self.mode = mode; self.authBroken = authBroken
    }
}

public struct PaneState: Codable, Equatable, Sendable {
    public var pane: String
    public var sessionTitle: String
    public var override: String?
    public init(pane: String, sessionTitle: String, override: String?) {
        self.pane = pane; self.sessionTitle = sessionTitle; self.override = override
    }
}

public struct RouterState: Codable, Equatable, Sendable {
    public var enabled: Bool
    public var audioMuted: Bool
    public var sessionDefault: String
    public var muteFocusedPane: Bool
    public var language: String
    public var remote: RemoteState
    public var tts: TtsState
    public var summarize: SummarizeState
    public var messages: [Message]
    public var panes: [PaneState]
}

public enum RouterDecoder {
    public static func state(_ data: Data) throws -> RouterState {
        try JSONDecoder().decode(RouterState.self, from: data)
    }
    public static func message(_ data: Data) throws -> Message {
        try JSONDecoder().decode(Message.self, from: data)
    }
}
