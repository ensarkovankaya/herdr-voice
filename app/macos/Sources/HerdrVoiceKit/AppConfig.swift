import Foundation

public struct AppConfig: Equatable {
    public let host: String
    public let port: Int
    public let token: String
    public init(host: String, port: Int, token: String) {
        self.host = host; self.port = port; self.token = token
    }
}

public extension AppConfig {
    // Parse herdr-voice config.json, keeping only what the app needs and
    // tolerating every other key. Missing fields fall back to defaults.
    static func parse(_ data: Data) throws -> AppConfig {
        let obj = (try JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let host = obj["host"] as? String ?? "127.0.0.1"
        let port = obj["port"] as? Int ?? 8973
        let token = obj["token"] as? String ?? ""
        return AppConfig(host: host, port: port, token: token)
    }

    // Config path: $HERD_VOICE_CONFIG if set, else ~/.herdr-voice/config.json.
    static func defaultURL() -> URL {
        if let override = ProcessInfo.processInfo.environment["HERD_VOICE_CONFIG"], !override.isEmpty {
            return URL(fileURLWithPath: override)
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".herdr-voice").appendingPathComponent("config.json")
    }

    static func load() throws -> AppConfig {
        try parse(Data(contentsOf: defaultURL()))
    }
}
