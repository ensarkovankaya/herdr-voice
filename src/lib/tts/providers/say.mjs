export function makeSayProvider({ spawn }) {
  return {
    name: 'say',
    async speak(text, { cfg }) {
      return new Promise((resolve) => {
        try {
          const voice = cfg?.tts?.say?.voice || '';
          const args = voice ? ['-v', voice, text] : [text];
          const child = spawn('say', args);

          const onClose = () => resolve();
          const onError = () => resolve();

          child.on('close', onClose);
          child.on('error', onError);
        } catch {
          resolve();
        }
      });
    },
  };
}
