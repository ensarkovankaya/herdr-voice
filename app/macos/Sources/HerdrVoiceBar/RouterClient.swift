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
        cfg.timeoutIntervalForRequest = 10
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

    func stream(
        onConnected: @Sendable @escaping () -> Void,
        onDisconnected: @Sendable @escaping () -> Void,
        onEvent: @Sendable @escaping (SSEEvent) -> Void
    ) async {
        var backoff: UInt64 = 1_000_000_000 // 1s
        while !Task.isCancelled {
            do {
                let (bytes, response) = try await session.bytes(for: request("/events", method: "GET"))
                if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                    throw URLError(.badServerResponse)
                }
                onConnected()
                backoff = 1_000_000_000
                let parser = SSEParser()
                for try await line in bytes.lines {
                    if Task.isCancelled { break }
                    // bytes.lines strips newlines; re-add the framing the parser expects.
                    for event in parser.consume(line + "\n") { onEvent(event) }
                    if line.isEmpty { _ = parser.consume("\n") } // blank line ends a frame
                }
                onDisconnected()
            } catch {
                onDisconnected()
            }
            if Task.isCancelled { break }
            try? await Task.sleep(nanoseconds: backoff)
            backoff = min(backoff * 2, 30_000_000_000) // cap 30s
        }
    }
}
