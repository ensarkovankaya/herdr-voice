import Foundation
import HerdrVoiceKit

func statusSummaryTests(_ t: TestReporter) {
    t.section("StatusSummary")

    // providerLine: full priority chain from providers (active engine first).
    t.eq(StatusSummary.providerLine(provider: nil, providers: ["gemini", "piper", "say"]),
         "Ses motoru: gemini → piper → say", "full chain in priority order")
    // single-entry providers → one name.
    t.eq(StatusSummary.providerLine(provider: "say", providers: ["say"]),
         "Ses motoru: say", "single provider")
    // providers set, provider empty → providers win (matches router providers[0]-first).
    t.eq(StatusSummary.providerLine(provider: "", providers: ["gemini", "say"]),
         "Ses motoru: gemini → say", "providers win over empty provider")
    // empty entries in providers are skipped.
    t.eq(StatusSummary.providerLine(provider: nil, providers: ["", "gemini", ""]),
         "Ses motoru: gemini", "skips empty entries")
    // no providers → fall back to the single provider field.
    t.eq(StatusSummary.providerLine(provider: "elevenlabs", providers: []),
         "Ses motoru: elevenlabs", "falls back to provider when providers empty")
    // nothing configured → say.
    t.eq(StatusSummary.providerLine(provider: nil, providers: []),
         "Ses motoru: say", "defaults to say")

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
