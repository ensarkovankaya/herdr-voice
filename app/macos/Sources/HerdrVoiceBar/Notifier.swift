import Foundation
import HerdrVoiceKit

// Posts notifications via `osascript display notification`, which works from any
// context (no bundle/signing/permission needed) — unlike UNUserNotificationCenter,
// which requires a stably-signed bundle the ad-hoc build can't provide. Tradeoff:
// no action buttons (the "Git" jump is not available in this path).
@MainActor
final class Notifier {
    // osascript needs no authorization or category setup.
    func activate() {}

    func post(_ plan: NotificationPlan) {
        // Approval cues get a bell prefix since there's no separate style/button.
        let title = plan.isApproval ? "🔔 \(plan.title)" : plan.title
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        p.arguments = ["-e", "display notification \(osaQuote(plan.body)) with title \(osaQuote(title))"]
        try? p.run()
    }

    // AppleScript string literal: wrap in double quotes, escape backslashes then quotes.
    private func osaQuote(_ s: String) -> String {
        "\"" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
    }
}
