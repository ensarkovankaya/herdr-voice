import Foundation
import HerdrVoiceKit

func routerModelsTests(_ t: TestReporter) {
    t.section("RouterModels")

    let stateJSON = """
    {"enabled":true,"audioMuted":true,"sessionDefault":"on","muteFocusedPane":true,"language":"tr",
     "remote":{"present":true,"ip":"100.1.2.3","port":8973,"expiresAt":123.0},
     "tts":{"providers":["gemini","piper"]},
     "summarize":{"mode":"claude","authBroken":true},
     "messages":[
       {"id":"0-1","ts":"1970-01-01T00:00:00.000Z","text":"done","kind":"summary","cueKind":null,
        "sessionId":"s1","sessionTitle":"My App","workspace":"","tab":"","pane":"p1","mode":"local","provider":"gemini"}
     ],
     "panes":[{"pane":"w1:p1","sessionTitle":"Proj","override":"off"},{"pane":"w1:p2","sessionTitle":"","override":null}]}
    """
    do {
        let state = try RouterDecoder.state(Data(stateJSON.utf8))
        t.check(state.enabled, "state.enabled true")
        t.check(state.audioMuted, "state.audioMuted true")
        t.eq(state.language, "tr", "state.language")
        t.check(state.remote.present, "remote present")
        t.check(state.remote.ip == "100.1.2.3", "remote ip")
        t.eq(state.tts.providers, ["gemini", "piper"], "tts providers")
        t.eq(state.summarize.mode, "claude", "summarize mode")
        t.check(state.summarize.authBroken, "summarize authBroken true")
        t.eq(state.messages.count, 1, "messages count")
        t.eq(state.messages[0].kind, "summary", "message kind")
        t.check(state.messages[0].cueKind == nil, "cueKind nil")
        t.eq(state.messages[0].sessionTitle, "My App", "sessionTitle")
        t.eq(state.panes.count, 2, "panes decoded")
        t.eq(state.panes[0].override, "off", "override decoded")
        t.check(state.panes[1].override == nil, "null override → nil")
    } catch { t.check(false, "state decode threw \(error)") }

    let absentJSON = """
    {"enabled":false,"audioMuted":false,"sessionDefault":"on","muteFocusedPane":false,"language":"en",
     "remote":{"present":false},"tts":{"providers":[]},"summarize":{"mode":"heuristic","authBroken":false},"messages":[],"panes":[]}
    """
    do {
        let state = try RouterDecoder.state(Data(absentJSON.utf8))
        t.check(!state.audioMuted, "state.audioMuted false when absent")
        t.check(!state.remote.present, "remote absent")
        t.check(state.remote.ip == nil, "remote ip nil")
        t.check(!state.summarize.authBroken, "summarize authBroken false")
        t.check(state.messages.isEmpty, "messages empty")
        t.check(state.panes.isEmpty, "panes empty")
    } catch { t.check(false, "absent decode threw \(error)") }

    let cueJSON = """
    {"id":"0-2","ts":"1970-01-01T00:00:00.000Z","text":"approval needed","kind":"cue",
     "cueKind":"permission","sessionId":"s2","sessionTitle":"","workspace":"","tab":"","pane":"p2",
     "mode":"remote","provider":null}
    """
    do {
        let msg = try RouterDecoder.message(Data(cueJSON.utf8))
        t.eq(msg.kind, "cue", "cue kind")
        t.check(msg.cueKind == "permission", "cueKind permission")
        t.eq(msg.mode, "remote", "mode remote")
        t.check(msg.provider == nil, "provider nil")
    } catch { t.check(false, "cue decode threw \(error)") }
}
