export function defaultProvider(platform = process.platform) {
  return platform === 'darwin' ? 'say' : 'piper';
}
export function defaultVoice(provider) {
  return ({ say: 'Samantha', piper: 'en_US-lessac-medium', gemini: 'Kore' })[provider] || '';
}
