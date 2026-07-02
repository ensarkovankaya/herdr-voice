import Foundation
import HerdrVoiceKit

func statusSummaryTests(_ t: TestReporter) {
    t.section("StatusSummary")

    // providerLine: full priority chain from providers (active engine first).
    t.eq(StatusSummary.providerLine(providers: ["gemini", "piper", "say"]),
         "Ses motoru: gemini → piper → say", "full chain in priority order")
    t.eq(StatusSummary.providerLine(providers: ["say"]),
         "Ses motoru: say", "single provider")
    t.eq(StatusSummary.providerLine(providers: ["", "gemini", ""]),
         "Ses motoru: gemini", "skips empty entries")
    t.eq(StatusSummary.providerLine(providers: []),
         "Ses motoru: say", "defaults to say when empty")

    // remoteLine: absent -> nil.
    t.check(StatusSummary.remoteLine(RemoteState(present: false, ip: nil, port: nil, expiresAt: nil)) == nil,
            "no remote -> nil")
    // remoteLine: ip + port.
    t.eq(StatusSummary.remoteLine(RemoteState(present: true, ip: "1.2.3.4", port: 8973, expiresAt: nil)) ?? "",
         "Remote: 1.2.3.4:8973", "ip and port")
    // remoteLine: present but ip missing -> generic label.
    t.eq(StatusSummary.remoteLine(RemoteState(present: true, ip: nil, port: nil, expiresAt: nil)) ?? "",
         "Remote: aktif", "present without ip")
}
