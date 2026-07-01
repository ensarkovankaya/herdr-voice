import Foundation

// Manages a per-user LaunchAgent plist that starts the app at login.
//
// enable() writes the plist; disable() removes it; isEnabled reflects the file's
// presence. We deliberately do NOT run `launchctl bootstrap` on enable: the file's
// presence in ~/Library/LaunchAgents is enough for launchd to start the app at the
// next login, and skipping bootstrap avoids both killing the currently-running app
// (a `bootout` of our own job) and spawning a duplicate instance. The plist mirrors
// the hand-verified one: RunAtLoad, ProcessType Interactive, no KeepAlive (so
// quitting from the menu stays quit until the next login).
//
// Directory/label/program path are injectable for testing.
public struct LaunchAtLogin: Sendable {
    public let label: String
    public let programPath: String
    private let agentsDir: URL

    public init(label: String = "dev.herdr-voice.bar",
                programPath: String,
                agentsDir: URL? = nil) {
        self.label = label
        self.programPath = programPath
        self.agentsDir = agentsDir
            ?? FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Library/LaunchAgents", isDirectory: true)
    }

    public var plistURL: URL {
        agentsDir.appendingPathComponent("\(label).plist", isDirectory: false)
    }

    public var isEnabled: Bool {
        FileManager.default.fileExists(atPath: plistURL.path)
    }

    public func enable() throws {
        try FileManager.default.createDirectory(at: agentsDir, withIntermediateDirectories: true)
        try Self.plistContents(label: label, programPath: programPath)
            .write(to: plistURL, atomically: true, encoding: .utf8)
    }

    public func disable() throws {
        let fm = FileManager.default
        if fm.fileExists(atPath: plistURL.path) {
            try fm.removeItem(at: plistURL)
        }
    }

    // Pure, testable plist builder. XML-escapes interpolated values so an unusual
    // home path (e.g. containing `&`) can't corrupt the plist.
    public static func plistContents(label: String, programPath: String) -> String {
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
          <key>Label</key>
          <string>\(xmlEscape(label))</string>
          <key>ProgramArguments</key>
          <array>
            <string>\(xmlEscape(programPath))</string>
          </array>
          <key>RunAtLoad</key>
          <true/>
          <key>ProcessType</key>
          <string>Interactive</string>
        </dict>
        </plist>
        """
    }

    private static func xmlEscape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }
}
