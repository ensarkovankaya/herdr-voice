// app/macos/Sources/HerdrVoiceBar/RouterClient.swift
import Foundation
import HerdrVoiceKit

// Thin async client for the herdr-voice router. All requests carry the
// x-voice-token header. `stream` consumes the SSE endpoint and reconnects with
// backoff until its Task is cancelled.
actor RouterClient {
    private let config: AppConfig
    private let session: URLSession

    init(config: AppConfig) {
        self.config = config
        let cfg = URLSessionConfiguration.default
        // SSE is long-lived: this "wait for data" timeout MUST exceed the router's
        // keep-alive interval (~20s) or the idle stream is killed and reconnects in a
        // loop, missing live events. 60s leaves comfortable margin over the ping.
        cfg.timeoutIntervalForRequest = 60
        cfg.timeoutIntervalForResource = TimeInterval(Int.max) // SSE is long-lived
        self.session = URLSession(configuration: cfg)
    }

    private func url(_ path: String) -> URL {
        URL(string: "http://\(config.host):\(config.port)\(path)")!
    }

    private func request(_ path: String, method: String) -> URLRequest {
        var req = URLRequest(url: url(path))
        req.httpMethod = method
        req.setValue(config.token, forHTTPHeaderField: "x-voice-token")
        return req
    }

    func fetchState() async throws -> RouterState {
        let (data, _) = try await session.data(for: request("/state", method: "GET"))
        return try RouterDecoder.state(data)
    }

    func toggle() async throws -> Bool {
        let (data, _) = try await session.data(for: request("/toggle", method: "POST"))
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return obj?["enabled"] as? Bool ?? false
    }

    func setAudio() async throws -> Bool {
        let (data, _) = try await session.data(for: request("/audio", method: "POST"))
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return obj?["audioMuted"] as? Bool ?? false
    }

    func replay(id: String) async throws {
        var req = request("/replay", method: "POST")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["id": id])
        _ = try await session.data(for: req)
    }
}
