import Foundation
import HerdrVoiceKit

func statusSummaryTests(_ t: TestReporter) {
    t.section("StatusSummary")

    // providerLine: explicit provider wins.
    t.eq(StatusSummary.providerLine(provider: "elevenlabs", providers: ["say"]),
         "Ses motoru: elevenlabs", "explicit provider")
    // providerLine: nil provider falls back to first non-empty of providers.
    t.eq(StatusSummary.providerLine(provider: nil, providers: ["openai", "say"]),
         "Ses motoru: openai", "falls back to first provider")
    // providerLine: empty provider is treated as absent.
    t.eq(StatusSummary.providerLine(provider: "", providers: ["", "say"]),
         "Ses motoru: say", "skips empty strings")
    // providerLine: nothing configured -> macOS default "say".
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
