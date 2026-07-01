// Minimal assertion harness (no XCTest under CLT). State lives in the instance,
// not globals, so Swift 6 strict concurrency is satisfied when called from the
// MainActor-isolated main.swift.
final class TestReporter {
    private(set) var failures = 0
    func section(_ name: String) { print("• \(name)") }
    func check(_ cond: Bool, _ msg: String) {
        if cond { print("  ok: \(msg)") } else { failures += 1; print("  FAIL: \(msg)") }
    }
    func eq<T: Equatable>(_ a: T, _ b: T, _ msg: String) {
        check(a == b, "\(msg) — got \(a), want \(b)")
    }
}
