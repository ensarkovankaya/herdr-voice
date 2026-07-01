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
    public var provider: String?
    public var providers: [String]
    public init(provider: String?, providers: [String]) {
        self.provider = provider; self.providers = providers
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
    public var messages: [Message]
}

public enum RouterDecoder {
    public static func state(_ data: Data) throws -> RouterState {
        try JSONDecoder().decode(RouterState.self, from: data)
    }
    public static func message(_ data: Data) throws -> Message {
        try JSONDecoder().decode(Message.self, from: data)
    }
}
