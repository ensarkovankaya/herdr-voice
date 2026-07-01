import Foundation

public struct SSEEvent: Equatable, Sendable {
    public let name: String
    public let data: String
    public init(name: String, data: String) { self.name = name; self.data = data }
}

// Incremental Server-Sent-Events frame parser. Feed arbitrary string chunks;
// returns completed frames (terminated by a blank line). Comment lines
// (starting with ':') are keep-alives and are ignored.
public final class SSEParser {
    private var buffer = ""
    public init() {}

    public func consume(_ chunk: String) -> [SSEEvent] {
        buffer += chunk
        var events: [SSEEvent] = []
        while let sep = buffer.range(of: "\n\n") {
            let frame = String(buffer[buffer.startIndex..<sep.lowerBound])
            buffer.removeSubrange(buffer.startIndex..<sep.upperBound)
            var name = "message"
            var data: String?
            for line in frame.split(separator: "\n", omittingEmptySubsequences: false) {
                if line.hasPrefix(":") { continue }
                if line.hasPrefix("event: ") { name = String(line.dropFirst("event: ".count)) }
                else if line.hasPrefix("data: ") { data = String(line.dropFirst("data: ".count)) }
            }
            if let d = data { events.append(SSEEvent(name: name, data: d)) }
        }
        return events
    }
}
