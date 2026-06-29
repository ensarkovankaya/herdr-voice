// Default TTS provider for an OS: macOS speaks via `say`, others via Piper.
export function defaultProvider(platform = process.platform) {
  return platform === 'darwin' ? 'say' : 'piper';
}
// Default voice name for a provider ('' if unknown).
export function defaultVoice(provider) {
  return ({ say: 'Samantha', piper: 'en_US-lessac-medium', gemini: 'Kore' })[provider] || '';
}
