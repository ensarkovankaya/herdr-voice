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

    // "TabName · p4": the tab label plus the pane's short number (the last
    // `:`-separated component of the pane id). Falls back to the raw pane id
    // when the tab label is unknown (outside herdr, pre-3.2 history entries).
    public static func paneShortName(pane: String, tabName: String?) -> String {
        let tn = tabName ?? ""
        guard !tn.isEmpty else { return pane }
        let pn = pane.split(separator: ":").last.map(String.init) ?? ""
        return pn.isEmpty ? tn : tn + " · " + pn
    }

    // Menu label for a pane: tab label + pane number when known, else the
    // session title, else the raw pane id.
    public static func paneLabel(_ p: PaneState) -> String {
        if let tn = p.tabName, !tn.isEmpty { return paneShortName(pane: p.pane, tabName: tn) }
        return p.sessionTitle.isEmpty ? p.pane : p.sessionTitle
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

    // Secondary line under a message row:
    // "session · workspace › tab p4 · relative-time", empty parts dropped —
    // e.g. "DP-T7 recap · General › Herdr Voice p4 · 2 dk".
    public static func messageSubtitle(sessionTitle: String, sessionId: String,
                                       workspaceName: String = "", tabName: String = "",
                                       pane: String = "", relative: String) -> String {
        let session = sessionTitle.isEmpty ? (sessionId.isEmpty ? "?" : sessionId) : sessionTitle
        var tabPart = ""
        if !tabName.isEmpty {
            let pn = pane.split(separator: ":").last.map(String.init) ?? ""
            tabPart = pn.isEmpty ? tabName : tabName + " " + pn
        }
        let location = [workspaceName, tabPart].filter { !$0.isEmpty }.joined(separator: " › ")
        return [session, location, relative].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}
