import Foundation
import HerdrVoiceKit

func appConfigTests(_ t: TestReporter) {
    t.section("AppConfig")

    do {
        let cfg = try AppConfig.parse(Data(#"{"token":"SECRET","host":"127.0.0.1","port":8973,"language":"tr"}"#.utf8))
        t.eq(cfg, AppConfig(host: "127.0.0.1", port: 8973, token: "SECRET"), "full config ignores unknown keys")
    } catch { t.check(false, "parse full threw \(error)") }

    do {
        let cfg = try AppConfig.parse(Data("{}".utf8))
        t.eq(cfg, AppConfig(host: "127.0.0.1", port: 8973, token: ""), "defaults for missing fields")
    } catch { t.check(false, "parse empty threw \(error)") }

    setenv("HERD_VOICE_CONFIG", "/tmp/does-not-matter.json", 1)
    t.eq(AppConfig.defaultURL().path, "/tmp/does-not-matter.json", "defaultURL honors env override")
    unsetenv("HERD_VOICE_CONFIG")
}
