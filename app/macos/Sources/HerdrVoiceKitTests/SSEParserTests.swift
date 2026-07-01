import HerdrVoiceKit

func sseParserTests(_ t: TestReporter) {
    t.section("SSEParser")

    let p1 = SSEParser()
    t.eq(p1.consume("event: toggle\ndata: {\"enabled\":true}\n\n"),
         [SSEEvent(name: "toggle", data: "{\"enabled\":true}")], "single frame")

    let p2 = SSEParser()
    t.eq(p2.consume("event: speak\nda"), [], "partial frame yields nothing")
    t.eq(p2.consume("ta: {\"text\":\"hi\"}\n\n"),
         [SSEEvent(name: "speak", data: "{\"text\":\"hi\"}")], "frame completes across chunks")

    let p3 = SSEParser()
    t.eq(p3.consume("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n"),
         [SSEEvent(name: "a", data: "1"), SSEEvent(name: "b", data: "2")], "two frames one chunk")

    let p4 = SSEParser()
    t.eq(p4.consume(": ping\n\n"), [], "comment keepalive → none")
    t.eq(p4.consume(": connected\n\n"), [], "comment connected → none")

    let p5 = SSEParser()
    t.eq(p5.consume("data: hello\n\n"), [SSEEvent(name: "message", data: "hello")], "data without event → message")
}
