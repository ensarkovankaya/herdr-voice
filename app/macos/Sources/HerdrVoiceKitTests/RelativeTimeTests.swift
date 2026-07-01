import Foundation
import HerdrVoiceKit

func relativeTimeTests(_ t: TestReporter) {
    t.section("RelativeTime")
    let now = ISO8601DateFormatter().date(from: "2026-07-01T12:00:00Z")!
    t.eq(RelativeTime.short(fromISO: "2026-07-01T11:59:40Z", now: now), "şimdi", "just now")
    t.eq(RelativeTime.short(fromISO: "2026-07-01T11:55:00Z", now: now), "5dk", "minutes")
    t.eq(RelativeTime.short(fromISO: "2026-07-01T11:55:00.000Z", now: now), "5dk", "millis form parses")
    t.eq(RelativeTime.short(fromISO: "2026-07-01T09:00:00Z", now: now), "3sa", "hours")
    t.eq(RelativeTime.short(fromISO: "2026-06-29T12:00:00Z", now: now), "2g", "days")
    t.eq(RelativeTime.short(fromISO: "not a date", now: now), "", "unparseable → empty")
}
