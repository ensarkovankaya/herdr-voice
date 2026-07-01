import Foundation
import HerdrVoiceKit

// Streams SSE via URLSessionDataDelegate.didReceive(data:) for reliable real-time
// delivery — URLSession.bytes(for:).lines buffers text/event-stream and does not
// yield events live. Reconnects with backoff. Callbacks fire on the URLSession
// delegate queue (a serial background queue), so parser access is serialized.
final class SSEClient: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private let config: AppConfig
    private let onConnected: @Sendable () -> Void
    private let onDisconnected: @Sendable () -> Void
    private let onEvent: @Sendable (SSEEvent) -> Void

    private var session: URLSession!
    private var task: URLSessionDataTask?
    private var parser = SSEParser()
    private var running = false
    private var backoff: TimeInterval = 1

    init(config: AppConfig,
         onConnected: @escaping @Sendable () -> Void,
         onDisconnected: @escaping @Sendable () -> Void,
         onEvent: @escaping @Sendable (SSEEvent) -> Void) {
        self.config = config
        self.onConnected = onConnected
        self.onDisconnected = onDisconnected
        self.onEvent = onEvent
        super.init()
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 3600
        cfg.timeoutIntervalForResource = TimeInterval(Int.max)
        self.session = URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
    }

    func start() { running = true; connect() }
    func stop() { running = false; task?.cancel() }

    private func connect() {
        var req = URLRequest(url: URL(string: "http://\(config.host):\(config.port)/events")!)
        req.setValue(config.token, forHTTPHeaderField: "x-voice-token")
        parser = SSEParser()
        let t = session.dataTask(with: req)
        task = t
        t.resume()
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask,
                    didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        if let http = response as? HTTPURLResponse, http.statusCode == 200 {
            backoff = 1
            onConnected()
            completionHandler(.allow)
        } else {
            completionHandler(.cancel)
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let s = String(data: data, encoding: .utf8) else { return }
        for event in parser.consume(s) { onEvent(event) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        onDisconnected()
        guard running else { return }
        let delay = backoff
        backoff = min(backoff * 2, 30)
        DispatchQueue.global().asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, self.running else { return }
            self.connect()
        }
    }
}
