import HerdrVoiceKit

func smokeTests(_ t: TestReporter) {
    t.section("smoke")
    t.eq(HerdrVoiceKit.name, "HerdrVoiceBar", "namespace name")
}
