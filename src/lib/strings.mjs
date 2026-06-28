// Built-in spoken-string packs, selected by config.language.
// Any single string can be overridden per-key in config.json
// (cue, fallback, voiceOnText, voiceOffText).
export const STRINGS = {
  en: { cue: 'Approval needed.', fallback: 'Done.', voiceOn: 'Voice on.', voiceOff: 'Voice off.' },
  tr: { cue: 'Onayın gerekiyor.', fallback: 'Tamamlandı.', voiceOn: 'Ses açıldı.', voiceOff: 'Ses kapandı.' },
};

export function stringsFor(language) {
  return STRINGS[language] || STRINGS.en;
}
