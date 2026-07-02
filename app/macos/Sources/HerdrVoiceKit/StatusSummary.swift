import Foundation

// Pure formatters for the menu's detail row. Kept out of the AppKit target so
// the wording and fallbacks are unit-testable. All copy is Turkish.
public enum StatusSummary {
    // The active TTS engine plus its fallback chain, in the router's priority
    // order (providers[0] is the active engine; the rest are fallbacks). Falls
    // back to `provider`, then the macOS built-in "say".
    public static func providerLine(provider: String?, providers: [String]) -> String {
        let chain = providers.filter { !$0.isEmpty }
        let names: [String]
        if !chain.isEmpty { names = chain }
        else if let p = provider, !p.isEmpty { names = [p] }
        else { names = ["say"] }
        return "Ses motoru: " + names.joined(separator: " → ")
    }

    // The registered remote sink, or nil when none is live.
    public static func remoteLine(_ remote: RemoteState) -> String? {
        guard remote.present else { return nil }
        guard let ip = remote.ip, !ip.isEmpty else { return "Remote: aktif" }
        let port = remote.port.map { ":\($0)" } ?? ""
        return "Remote: \(ip)\(port)"
    }
}
