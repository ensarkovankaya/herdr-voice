import Foundation
import HerdrVoiceKit

func launchAtLoginTests(_ t: TestReporter) {
    t.section("LaunchAtLogin")
    let fm = FileManager.default
    let tmp = fm.temporaryDirectory
        .appendingPathComponent("herdr-lal-\(ProcessInfo.processInfo.processIdentifier)", isDirectory: true)
    try? fm.removeItem(at: tmp)

    let lal = LaunchAtLogin(
        label: "dev.herdr-voice.bar",
        programPath: "/Users/x/Applications/HerdrVoiceBar.app/Contents/MacOS/HerdrVoiceBar",
        agentsDir: tmp)

    t.check(!lal.isEnabled, "disabled when plist absent")

    // Pure builder shape.
    let xml = LaunchAtLogin.plistContents(label: "dev.herdr-voice.bar", programPath: "/tmp/Bar")
    t.check(xml.contains("<string>dev.herdr-voice.bar</string>"), "plist carries the label")
    t.check(xml.contains("<string>/tmp/Bar</string>"), "plist carries the program path")
    t.check(xml.contains("<key>RunAtLoad</key>"), "plist has RunAtLoad")
    t.check(!xml.contains("KeepAlive"), "plist has no KeepAlive")

    // enable() writes the file.
    do { try lal.enable() } catch { t.check(false, "enable() threw: \(error)") }
    t.check(lal.isEnabled, "enabled after enable()")
    t.check(fm.fileExists(atPath: lal.plistURL.path), "plist exists on disk")
    let written = (try? String(contentsOf: lal.plistURL, encoding: .utf8)) ?? ""
    t.check(written.contains("HerdrVoiceBar"), "written plist references the program path")

    // disable() removes the file.
    do { try lal.disable() } catch { t.check(false, "disable() threw: \(error)") }
    t.check(!lal.isEnabled, "disabled after disable()")
    t.check(!fm.fileExists(atPath: lal.plistURL.path), "plist removed from disk")

    // disable() is idempotent when already absent.
    do { try lal.disable() } catch { t.check(false, "disable() should not throw when absent: \(error)") }

    // XML escaping of an unusual program path.
    let esc = LaunchAtLogin.plistContents(label: "L", programPath: "/Users/a&b/Bar")
    t.check(esc.contains("/Users/a&amp;b/Bar"), "program path is XML-escaped")

    try? fm.removeItem(at: tmp)
}
