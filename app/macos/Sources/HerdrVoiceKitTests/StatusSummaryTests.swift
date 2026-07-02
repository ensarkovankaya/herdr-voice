import Foundation
import HerdrVoiceKit

func statusSummaryTests(_ t: TestReporter) {
    t.section("StatusSummary")

    // remoteLine: absent -> nil.
    t.check(StatusSummary.remoteLine(RemoteState(present: false, ip: nil, port: nil, expiresAt: nil)) == nil,
            "no remote -> nil")
    // remoteLine: ip + port.
    t.eq(StatusSummary.remoteLine(RemoteState(present: true, ip: "1.2.3.4", port: 8973, expiresAt: nil)) ?? "",
         "Remote: 1.2.3.4:8973", "ip and port")
    // remoteLine: present but ip missing -> generic label.
    t.eq(StatusSummary.remoteLine(RemoteState(present: true, ip: nil, port: nil, expiresAt: nil)) ?? "",
         "Remote: aktif", "present without ip")

    t.eq(StatusSummary.summarizeAuthWarning, "⚠︎ Claude oturumu kapalı — /login gerekli", "auth warning string")

    // paneLabel: prefers sessionTitle, falls back to pane id when title empty.
    t.eq(StatusSummary.paneLabel(PaneState(pane: "w1:p1", sessionTitle: "Proj A", override: nil)),
         "Proj A", "label prefers title")
    t.eq(StatusSummary.paneLabel(PaneState(pane: "w1:p1", sessionTitle: "", override: "off")),
         "w1:p1", "falls back to pane id")

    // statusHeadline: priority connected > enabled > muted
    t.eq(StatusSummary.statusHeadline(connected: false, enabled: true, audioMuted: false),
         "Bağlantı yok", "disconnected wins")
    t.eq(StatusSummary.statusHeadline(connected: true, enabled: false, audioMuted: true),
         "Duraklatıldı", "paused beats muted")
    t.eq(StatusSummary.statusHeadline(connected: true, enabled: true, audioMuted: true),
         "Sadece bildirim", "muted")
    t.eq(StatusSummary.statusHeadline(connected: true, enabled: true, audioMuted: false),
         "Aktif", "active")

    // statusDetail
    t.eq(StatusSummary.statusDetail(providers: ["gemini", "piper", "say"], summarizeMode: "claude"),
         "gemini → piper → say · özet: claude", "full detail")
    t.eq(StatusSummary.statusDetail(providers: [], summarizeMode: ""),
         "say · özet: heuristic", "defaults")
    t.eq(StatusSummary.statusDetail(providers: ["", "piper"], summarizeMode: "claude"),
         "piper · özet: claude", "empty names filtered")

    // messageSubtitle
    t.eq(StatusSummary.messageSubtitle(sessionTitle: "herd-voice", sessionId: "abc", relative: "2 dk"),
         "herd-voice · 2 dk", "title + time")
    t.eq(StatusSummary.messageSubtitle(sessionTitle: "", sessionId: "abc123", relative: ""),
         "abc123", "id fallback, no time")
    t.eq(StatusSummary.messageSubtitle(sessionTitle: "", sessionId: "", relative: "şimdi"),
         "? · şimdi", "unknown session")
}
