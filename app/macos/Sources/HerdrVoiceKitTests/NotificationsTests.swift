import HerdrVoiceKit

func notificationsTests(_ t: TestReporter) {
    t.section("NotificationPolicy")

    func msg(kind: String, title: String = "My App", sid: String = "s1", pane: String = "p1", text: String = "hello") -> Message {
        Message(id: "1", ts: "2026-07-01T12:00:00.000Z", text: text, kind: kind, cueKind: kind == "cue" ? "permission" : nil,
                sessionId: sid, sessionTitle: title, workspace: "", tab: "", pane: pane, mode: "local", provider: nil)
    }

    // off → never
    t.check(NotificationPolicy.make(for: msg(kind: "summary"), mode: .off) == nil, "off + summary → nil")
    t.check(NotificationPolicy.make(for: msg(kind: "cue"), mode: .off) == nil, "off + cue → nil")

    // approvals → only cues
    t.check(NotificationPolicy.make(for: msg(kind: "summary"), mode: .approvals) == nil, "approvals + summary → nil")
    let ap = NotificationPolicy.make(for: msg(kind: "cue"), mode: .approvals)
    t.check(ap != nil && ap!.isApproval, "approvals + cue → approval plan")

    // all → both
    let s = NotificationPolicy.make(for: msg(kind: "summary"), mode: .all)
    t.check(s != nil && !s!.isApproval, "all + summary → non-approval plan")
    t.check(NotificationPolicy.make(for: msg(kind: "cue"), mode: .all)?.isApproval == true, "all + cue → approval plan")

    // content mapping
    let p = NotificationPolicy.make(for: msg(kind: "cue", pane: "w1:p4", text: "onay lazım"), mode: .all)!
    t.eq(p.title, "My App", "title = sessionTitle")
    t.eq(p.body, "onay lazım", "body = text")
    t.eq(p.pane, "w1:p4", "pane carried")

    // title fallbacks
    t.eq(NotificationPolicy.make(for: msg(kind: "summary", title: "", sid: "abc"), mode: .all)!.title, "abc", "title falls back to sessionId")
    t.eq(NotificationPolicy.make(for: msg(kind: "summary", title: "", sid: ""), mode: .all)!.title, "herdr-voice", "title falls back to default")
}
