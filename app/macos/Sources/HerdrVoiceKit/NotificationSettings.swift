import Foundation

// Persists the notification mode in UserDefaults. Default: approvals-only.
public struct NotificationSettings {
    private let defaults: UserDefaults
    private let key = "notificationMode"
    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    public var mode: NotificationMode {
        get { NotificationMode(rawValue: defaults.string(forKey: key) ?? "") ?? .approvals }
        set { defaults.set(newValue.rawValue, forKey: key) }
    }
}
