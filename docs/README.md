# herdr-voice documentation

Reference and guides for [herdr-voice](../README.md). Start with the
[README](../README.md) for what it is and how to install; come here for depth.

## Guides

| Doc                                      | What's in it                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)       | How it works end to end: host→sink routing, presence over Tailscale, the speak pipeline, and the three abstraction layers. |
| [configuration.md](configuration.md)     | Complete `config.json` reference — every field, the `tts`/`audio`/`summarize` blocks, env vars, and localization.          |
| [providers.md](providers.md)             | Setting up `say` / `piper` / `gemini`, and the contract for writing your own TTS provider.                                 |
| [summarizer.md](summarizer.md)           | The `heuristic` / `claude` / `llm` / `command` modes with copy-paste recipes (your logged-in Claude, OpenAI, Gemini).      |
| [remote-setup.md](remote-setup.md)       | Running the host + remote roles so audio follows you across devices; token pairing and presence.                           |
| [troubleshooting.md](troubleshooting.md) | Diagnostics, the no-sound checklist, daemon/log inspection, and provider-specific fixes.                                   |
| [migration-v1-v2.md](migration-v1-v2.md) | What changed in v2 and the one-line config edit to carry your voice over.                                                  |

## Also at the repo root

- [CONTRIBUTING.md](../CONTRIBUTING.md) — project layout, the zero-dependency
  and dependency-injection conventions, and how to add providers/modes/tests.
- [CHANGELOG.md](../CHANGELOG.md) — version history.

> Note: `docs/superpowers/` (design specs, plans, scratch) is intentionally
> gitignored and not part of the published docs.
