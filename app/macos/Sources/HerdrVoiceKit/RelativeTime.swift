import Foundation

public enum RelativeTime {
    // Router timestamps look like "1970-01-01T00:00:00.000Z" (with millis) or
    // without; accept both.
    private static func parse(_ iso: String) -> Date? {
        let withFrac = ISO8601DateFormatter()
        withFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFrac.date(from: iso) { return d }
        return ISO8601DateFormatter().date(from: iso)
    }

    public static func short(fromISO iso: String, now: Date) -> String {
        guard let then = parse(iso) else { return "" }
        let secs = Int(now.timeIntervalSince(then))
        if secs < 45 { return "şimdi" }
        let mins = secs / 60
        if mins < 60 { return "\(mins)dk" }
        let hours = mins / 60
        if hours < 24 { return "\(hours)sa" }
        return "\(hours / 24)g"
    }
}
