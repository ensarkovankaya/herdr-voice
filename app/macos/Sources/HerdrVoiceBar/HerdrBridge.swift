// app/macos/Sources/HerdrVoiceBar/HerdrBridge.swift
import Foundation

// Best-effort bridge to the herdr CLI. Used to focus the pane a notification
// came from. Failures are swallowed (herdr may be absent / pane gone).
enum HerdrBridge {
    static func focusPane(_ pane: String) {
        guard !pane.isEmpty else { return }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/sh")
        // Login shell so the user's PATH (herdr on it) is loaded.
        p.arguments = ["-lc", "hb=\"$(command -v herdr || echo \"$HOME/.local/bin/herdr\")\"; \"$hb\" agent focus \(shellQuote(pane))"]
        do { try p.run() } catch { /* herdr unavailable — ignore */ }
    }

    private static func shellQuote(_ s: String) -> String {
        "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}
