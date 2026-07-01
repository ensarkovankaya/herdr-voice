import Foundation

public struct Message: Codable, Equatable, Identifiable {
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
}

public struct RemoteState: Codable, Equatable {
    public var present: Bool
    public var ip: String?
    public var port: Int?
    public var expiresAt: Double?
    public init(present: Bool, ip: String?, port: Int?, expiresAt: Double?) {
        self.present = present; self.ip = ip; self.port = port; self.expiresAt = expiresAt
    }
}

public struct TtsState: Codable, Equatable {
    public var provider: String?
    public var providers: [String]
}

public struct RouterState: Codable, Equatable {
    public var enabled: Bool
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
