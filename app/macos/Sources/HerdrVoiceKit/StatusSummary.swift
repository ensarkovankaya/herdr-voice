import Foundation

// Pure formatters for the menu's detail row. Kept out of the AppKit target so
// the wording and fallbacks are unit-testable. All copy is Turkish.
public enum StatusSummary {
    // The registered remote sink, or nil when none is live.
    public static func remoteLine(_ remote: RemoteState) -> String? {
        guard remote.present else { return nil }
        guard let ip = remote.ip, !ip.isEmpty else { return "Remote: aktif" }
        let port = remote.port.map { ":\($0)" } ?? ""
        return "Remote: \(ip)\(port)"
    }

    // Shown when mode == "claude" and the CLI reports it is logged out.
    public static let summarizeAuthWarning = "⚠︎ Claude oturumu kapalı — /login gerekli"

    // Menu label for a pane: the session title when known, else the raw pane id.
    public static func paneLabel(_ p: PaneState) -> String {
        p.sessionTitle.isEmpty ? p.pane : p.sessionTitle
    }

    // Bold first line of the two-line status header. Priority mirrors the
    // menu-bar icon: no connection > paused > notifications-only > active.
    public static func statusHeadline(connected: Bool, enabled: Bool, audioMuted: Bool) -> String {
        if !connected { return "Bağlantı yok" }
        if !enabled { return "Duraklatıldı" }
        if audioMuted { return "Sadece bildirim" }
        return "Aktif"
    }

    // Secondary line under the headline: engine chain + summarizer mode.
    public static func statusDetail(providers: [String], summarizeMode: String) -> String {
        let chain = providers.filter { !$0.isEmpty }
        let names = chain.isEmpty ? ["say"] : chain
        return names.joined(separator: " → ") + " · özet: " + (summarizeMode.isEmpty ? "heuristic" : summarizeMode)
    }

    // Secondary line under a message row: "session · relative-time".
    public static func messageSubtitle(sessionTitle: String, sessionId: String, relative: String) -> String {
        let session = sessionTitle.isEmpty ? (sessionId.isEmpty ? "?" : sessionId) : sessionTitle
        return relative.isEmpty ? session : session + " · " + relative
    }
}
