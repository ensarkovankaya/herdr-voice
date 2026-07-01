// app/macos/Sources/HerdrVoiceBar/Notifier.swift
import UserNotifications
import HerdrVoiceKit

// Posts macOS notifications via UNUserNotificationCenter. Requires the app to run
// as a bundle (Bundle.main.bundleIdentifier != nil) — `activate()` is a no-op
// otherwise, so the bare executable never traps.
@MainActor
final class Notifier: NSObject, UNUserNotificationCenterDelegate {
    // `nonisolated` so the nonisolated delegate methods below can reference them
    // (static members of a @MainActor type are otherwise main-actor-isolated).
    nonisolated static let categoryApproval = "APPROVAL"
    nonisolated static let actionFocus = "FOCUS"

    private var available: Bool { Bundle.main.bundleIdentifier != nil }

    // Request permission + register the approval category. Safe to call once at launch.
    func activate() {
        guard available else { return }
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let focus = UNNotificationAction(identifier: Self.actionFocus, title: "Git", options: [.foreground])
        let category = UNNotificationCategory(identifier: Self.categoryApproval, actions: [focus],
                                              intentIdentifiers: [], options: [])
        center.setNotificationCategories([category])
        center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    func post(_ plan: NotificationPlan) {
        guard available else { return }
        let content = UNMutableNotificationContent()
        content.title = plan.title
        content.body = plan.body
        content.sound = .default
        if plan.isApproval {
            content.categoryIdentifier = Self.categoryApproval
            content.userInfo = ["pane": plan.pane]
        }
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    // Show notifications even when the app is frontmost.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    // Handle a tap or the "Git" action → focus the originating pane.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let pane = response.notification.request.content.userInfo["pane"] as? String ?? ""
        if response.actionIdentifier == Self.actionFocus || response.actionIdentifier == UNNotificationDefaultActionIdentifier {
            HerdrBridge.focusPane(pane)
        }
        completionHandler()
    }
}
