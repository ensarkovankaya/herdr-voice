import Foundation
import HerdrVoiceKit

func notificationSettingsTests(_ t: TestReporter) {
    t.section("NotificationSettings")
    let suite = "herdr-voice-test-\(ProcessInfo.processInfo.processIdentifier)"
    let defaults = UserDefaults(suiteName: suite)!
    defaults.removePersistentDomain(forName: suite)

    var settings = NotificationSettings(defaults: defaults)
    t.eq(settings.mode, .approvals, "default mode is approvals")

    settings.mode = .off
    t.eq(NotificationSettings(defaults: defaults).mode, .off, "mode persists across instances")

    settings.mode = .all
    t.eq(NotificationSettings(defaults: defaults).mode, .all, "mode updates persist")

    defaults.removePersistentDomain(forName: suite)
}
