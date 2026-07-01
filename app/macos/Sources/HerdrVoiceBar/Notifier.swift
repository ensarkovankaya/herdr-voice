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
        DebugLog.log("post: title=\(title) body=\(plan.body)")
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        p.arguments = ["-e", "display notification \(osaQuote(plan.body)) with title \(osaQuote(title))"]
        let errPipe = Pipe(); p.standardError = errPipe
        do {
            try p.run()
            p.waitUntilExit()
            let e = String(data: errPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            DebugLog.log("post: osascript exit=\(p.terminationStatus) stderr=\(e)")
        } catch {
            DebugLog.log("post: run FAILED \(error)")
        }
    }

    // AppleScript string literal: wrap in double quotes, escape backslashes then quotes.
    private func osaQuote(_ s: String) -> String {
        "\"" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
    }
}
