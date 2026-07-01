import Foundation

let t = TestReporter()

// --- test registrations (later tasks add one line each below) ---
smokeTests(t)
routerModelsTests(t)
sseParserTests(t)
appConfigTests(t)
relativeTimeTests(t)
notificationsTests(t)
notificationSettingsTests(t)
// --- end registrations ---

if t.failures > 0 { print("\n\(t.failures) FAILED"); exit(1) } else { print("\nALL PASSED"); exit(0) }
