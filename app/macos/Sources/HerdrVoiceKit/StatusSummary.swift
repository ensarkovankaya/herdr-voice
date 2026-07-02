import Foundation

// Pure formatters for the menu's detail row. Kept out of the AppKit target so
// the wording and fallbacks are unit-testable. All copy is Turkish.
public enum StatusSummary {
    // The active TTS engine plus its fallback chain, in the router's priority
    // order (providers[0] is the active engine; the rest are fallbacks).
    public static func providerLine(providers: [String]) -> String {
        let chain = providers.filter { !$0.isEmpty }
        let names = chain.isEmpty ? ["say"] : chain
        return "Ses motoru: " + names.joined(separator: " → ")
    }

    // The registered remote sink, or nil when none is live.
    public static func remoteLine(_ remote: RemoteState) -> String? {
        guard remote.present else { return nil }
        guard let ip = remote.ip, !ip.isEmpty else { return "Remote: aktif" }
        let port = remote.port.map { ":\($0)" } ?? ""
        return "Remote: \(ip)\(port)"
    }

    // The summarizer backend shown in the menu ("Özet: claude").
    public static func summarizeLine(mode: String) -> String {
        "Özet: \(mode.isEmpty ? "heuristic" : mode)"
    }

    // Shown when mode == "claude" and the CLI reports it is logged out.
    public static let summarizeAuthWarning = "⚠︎ Claude oturumu kapalı — /login gerekli"

    // Menu label for a pane: the session title when known, else the raw pane id.
    public static func paneLabel(_ p: PaneState) -> String {
        p.sessionTitle.isEmpty ? p.pane : p.sessionTitle
    }
}
