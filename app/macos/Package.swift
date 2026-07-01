// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "HerdrVoiceBar",
    platforms: [.macOS(.v13)],
    targets: [
        .target(name: "HerdrVoiceKit"),
        .executableTarget(name: "HerdrVoiceBar", dependencies: ["HerdrVoiceKit"]),
        // Plain executable test runner (XCTest is unavailable under CLT-only).
        .executableTarget(name: "HerdrVoiceKitTests", dependencies: ["HerdrVoiceKit"]),
    ]
)
