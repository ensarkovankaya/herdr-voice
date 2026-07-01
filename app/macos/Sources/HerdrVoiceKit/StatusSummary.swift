import Foundation

// Pure formatters for the menu's detail row. Kept out of the AppKit target so
// the wording and fallbacks are unit-testable. All copy is Turkish.
public enum StatusSummary {
    // Active TTS engine. Prefers the configured `provider`, then the first
    // non-empty entry of `providers`, then the macOS built-in "say".
    public static func providerLine(provider: String?, providers: [String]) -> String {
        let candidates = [provider].compactMap { $0 } + providers
        let name = candidates.first { !$0.isEmpty } ?? "say"
        return "Ses motoru: \(name)"
    }

    // The registered remote sink, or nil when none is live.
    public static func remoteLine(_ remote: RemoteState) -> String? {
        guard remote.present else { return nil }
        guard let ip = remote.ip, !ip.isEmpty else { return "Remote: aktif" }
        let port = remote.port.map { ":\($0)" } ?? ""
        return "Remote: \(ip)\(port)"
    }
}
