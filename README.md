# herd-voice v2

Claude Code bir işi bitirdiğinde (veya onay/girdi beklerken), **o an oturduğun cihazda** kısa bir **Türkçe sesli özet** duyuran araç. macOS `say -v Yelda` ile konuşur; lokalde host Mac'ten, remote'dan `herdr --remote` ile bağlıyken away-laptop'tan çalar.

> VoiceInk gibi araçlar **ses→metin** (STT) tarafını çözer; herd-voice tersini yapar: **metin→ses** (TTS). Sadece Claude'un sesli **çıktısı** içindir.

______________________________________________________________________

## Nasıl çalışır?

```
[Claude Code @ host Mac] iş bitirir / onay bekler
        │  Stop hook (done)  ·  Notification hook (permission_prompt|idle_prompt)
        ▼
  speak-summary.mjs / notify-cue.mjs   (Node, Claude hook'ları)
        │  son asistan mesajını al → özetle → POST /speak {text}
        ▼
  voice-router  (launchd daemon @ host, 0.0.0.0:8973)
        │
        ├─ aktif remote sink kayıtlı & süresi geçmemiş?
        │       └─ HAYIR → host'ta lokal konuş:  say -v Yelda
        │
        └─ EVET → Tailscale üstünden POST http://<remote-ts-ip>:8973/speak
                       │  (timeout ~1.5s)
                       ├─ başarılı → voice-sink @ away-laptop → say -v Yelda
                       └─ başarısız → kaydı temizle + host'ta lokal say (fallback)
```

**"Aktif cihaz"** = o an herdr client'ının önünde oturduğun makine. `herdr --remote <host>` ile bağlandığında o cihaz kendini host router'a kaydeder (`/register`), çıkışta siler (`/deregister`). Kayıt yoksa/zaman aşımına uğramışsa router host'ta konuşur. Bu bilgi herdr'ın iç API'sine **bağlı değildir** (register + TTL + forward-timeout fallback ile yürür).

### Bileşenler

| Dosya                                      | Rol                                                                                                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/voice-router.mjs`                     | **Host daemon.** `/speak`'i alır, aktif cihaza yönlendirir; `/register`·`/deregister` ile remote sink'i tutar; remote erişilemezse lokal `say`'e düşer. launchd ile her zaman açık. |
| `src/voice-sink.mjs`                       | **Remote daemon.** `/speak {text}` → `say -v Yelda`. Install-remote ile launchd'ye yüklenir.                                                                                        |
| `src/speak-summary.mjs`                    | **Claude Stop hook.** Transcript'ten son asistan mesajını alır → `summarize` → router'a POST. Asla throw etmez (Claude'u bloklamaz).                                                |
| `src/notify-cue.mjs`                       | **Claude Notification hook.** Onay/girdi beklenirken sabit kısa ipucu ("Onayın gerekiyor.").                                                                                        |
| `src/lib/summarize.mjs`                    | Markdown/kod temizler, ≤240 karaktere ilk cümle(ler)e indirger, boş/kod-only ise "Tamamlandı."                                                                                      |
| `src/lib/{config,http,speak}.mjs`          | config yükleyici · küçük HTTP yardımcıları · seri `say` kuyruğu.                                                                                                                    |
| `bin/herdr-voice`                          | **CLI:** `start/stop/restart/status/logs/enable/disable` — makinenin herdr-voice daemon'unu yönetir.                                                                                |
| `plugin/`                                  | **herdr plugin** (`ensar.herd-voice`): toggle/enable/disable action'ları + durum (host öğünde).                                                                                     |
| `launchd/dev.ensar.herdr-voice.plist.tmpl` | voice-sink (remote) ve voice-router (host) için launchd şablonu.                                                                                                                    |

Diller: daemon'lar + Claude hook'ları **Node.js** (sıfır npm bağımlılığı, sadece stdlib), CLI + plugin action'ları **Bash**.

______________________________________________________________________

## Ön koşullar

- macOS (Apple Silicon veya Intel), Türkçe ses: `say -v Yelda` çalışmalı.
- **herdr ≥ 0.7.0** (plugin API; `herdr update`).
- `node` (nvm olabilir — install.sh/install-remote.sh mutlak yolu hook'lara/launchd'ye gömer), `jq`, `curl`, `tailscale`.
- Cihazlar arası **Tailscale** mesh (remote senaryosu için).
- `herdr --remote <host>` cmdline (herdr v0.7.0+) presence-aware routing için.

______________________________________________________________________

## Kurulum

### Host (Claude buradan koşar)

```sh
./install.sh
```

Yaptıkları:

1. `~/.herdr-voice/config.json` oluşturur ve **token üretir** (varsa ve token eksikse token'ı yamalar). Role: `host`.
2. Claude Stop + Notification hook'larını `~/.claude/settings.json`'a **idempotent** ekler (mevcut hook'ları korur).
3. launchd voice-router'ı yükler (`~/Library/LaunchAgents/dev.ensar.herdr-voice.plist`) ve health-check eder.
4. herdr plugin'i link'ler (`herdr plugin link plugin/`).

Sonra **keybind**'i `~/.config/herdr/config.toml`'a ekle (install.sh çıktıda da yazdırır) ve herdr'a yükletmek için `herdr server reload-config` çalıştır:

```toml
[[keys.command]]
key = "prefix+shift+v"
type = "plugin_action"
command = "ensar.herd-voice.toggle"
description = "herd-voice ses aç/kapa"
```

### Remote (away-laptop)

```sh
git clone https://github.com/ensarkovankaya/herdr-voice.git
cd herdr-voice
./install-remote.sh <HOST_TS_IP> <TOKEN> [REMOTE_HOST]
```

Örnek:

```sh
./install-remote.sh 100.109.4.84 <token-from-host-config> mac-m4-jftf
```

Yaptıkları:

1. `~/.herdr-voice/config.json` oluşturur. Role: `remote`, host IP, token, remoteHost (default: `mac-m4-jftf`).
2. `~/.local/bin/herdr-voice` CLI'sini yükler.
3. launchd voice-sink'i yükler (`~/Library/LaunchAgents/dev.ensar.herdr-voice.plist`).
4. Eski v1 config'ini siler (`~/.config/herd-voice`).

Kullanım:

```sh
herdr --remote <remoteHost>    # ör: herdr --remote mac-m4-jftf  → ses bu cihaza yönlendirilir
```

Token: host'taki `jq -r .token ~/.herdr-voice/config.json`. Token iki tarafta **aynı** olmalı.

______________________________________________________________________

## Konfigürasyon

`~/.herdr-voice/config.json` (override: `HERD_VOICE_CONFIG` env):

| Alan               | Varsayılan          | Açıklama                                                                                        |
| ------------------ | ------------------- | ----------------------------------------------------------------------------------------------- |
| `token`            | —                   | Paylaşılan secret; `X-Voice-Token` header'ında. Host ve remote'ta aynı.                         |
| `host`             | `127.0.0.1`         | Bu makinenin gördüğü **router adresi**. Host'ta `127.0.0.1`; remote'ta host'un Tailscale IP'si. |
| `port`             | `8973`              | Router/sink portu.                                                                              |
| `voice`            | `Yelda`             | `say -v` sesi.                                                                                  |
| `enabled`          | `true`              | Hook'lar yalnız `true` iken konuşur (router/sink her zaman çalışır).                            |
| `role`             | —                   | `host` veya `remote`. Host'ta router, remote'ta sink başlatır.                                  |
| `remoteHost`       | —                   | Remote'ta belirtilir; hangi uzak cihazın kendisini tanıtacağı adı.                              |
| `remoteTtlMs`      | `3600000`           | Remote kaydının emniyet süresi.                                                                 |
| `forwardTimeoutMs` | `1500`              | Router→remote sink forward timeout'u.                                                           |
| `postTimeoutMs`    | `1500`              | Hook→router POST timeout'u.                                                                     |
| `cue`              | `Onayın gerekiyor.` | Notification (blocked) ipucu metni.                                                             |

Sesi değiştirmek: `voice` alanını güncelle + ilgili daemon'u yeniden başlat.

______________________________________________________________________

## CLI: herdr-voice

Remote cihazda launchd daemon'unu yönetir:

```sh
herdr-voice start       # voice-sink başlat
herdr-voice stop        # voice-sink durdur
herdr-voice restart     # voice-sink'i yeniden başlat
herdr-voice status      # status + PID + log path
herdr-voice logs        # tail -f ~/.herdr-voice/logs/sink.log (varsa)
herdr-voice enable      # enabled=true yapıp sink'i yeniden başlat
herdr-voice disable     # enabled=false yapıp sink'i yeniden başlat
```

Örnek:

```sh
herdr-voice status     # → "dev.ensar.herdr-voice (voice-sink) running, PID 12345, enabled=true"
herdr-voice logs       # → sink.log'un son satırlarını göster
```

______________________________________________________________________

## Claude statusLine göstergesi

Status bar'da ses durumunu görmek için (`🔈 ses` açık / `🔇 ses` kapalı), Claude statusLine script'ine bir segment ekle.

**A) Bu repodaki segment'i çağır:**

```sh
seg=$("$HOME/Projects/herd-voice/statusline/herd-voice-segment.sh")   # "🔈 ses" / "🔇 ses"
```

**B) Ya da kendi statusLine script'ine renkli inline snippet ekle** (`~/.claude/settings.json`'daki `statusLine.command`'in işaret ettiği script'e):

```bash
hv=$(jq -r '.enabled // false' "$HOME/.herdr-voice/config.json" 2>/dev/null)
if [ "$hv" = "true" ]; then printf '  \033[2;32m🔈 ses\033[0m'
else                        printf '  \033[2;90m🔇 ses\033[0m'; fi
```

> statusLine script'i Claude Code'a aittir (repo dışı, ör. `~/.claude/statusline-command.sh`); her refresh'te yeniden çalışır, ekstra reload gerekmez.

______________________________________________________________________

## Günlükler

**Host** (`voice-router`):

```
~/.herdr-voice/logs/router.out.log   — stdout
~/.herdr-voice/logs/router.err.log   — stderr
```

**Remote** (`voice-sink`):

```
~/.herdr-voice/logs/sink.log   — stdout/stderr
```

Logları takip et:

```sh
# Host
tail -f ~/.herdr-voice/logs/router.*.log

# Remote
herdr-voice logs
# veya
tail -f ~/.herdr-voice/logs/sink.log
```

______________________________________________________________________

## Sorun giderme

### Router/Sink ayakta mı?

```sh
# Host
curl -fsS http://127.0.0.1:8973/health        # {"ok":true}

# Remote (sink)
herdr-voice status
```

### Plugin action geçmişi (toggle çalıştı mı, çıktı/exit)

```sh
herdr plugin log list --plugin ensar.herd-voice
```

### Ses açık mı?

```sh
jq .enabled ~/.herdr-voice/config.json
```

### Daemon'u yeniden başlat (config/token değişince)

Host:

```sh
launchctl kickstart -k "gui/$(id -u)/dev.ensar.herdr-voice"
```

Remote:

```sh
herdr-voice restart
```

### Manuel sesli test

```sh
TOKEN=$(jq -r .token ~/.herdr-voice/config.json)
curl -X POST http://127.0.0.1:8973/speak \
  -H "X-Voice-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Merhaba"}'
```

### Presence debug (remote register)

Host router log'unda register/deregister geçişlerini izle:

```sh
tail -f ~/.herdr-voice/logs/router.out.log | grep -i register
```

### Ses gelmiyorsa kontrol listesi

1. **Host:** `enabled=true` mı? → `jq .enabled ~/.herdr-voice/config.json`
2. **Host:** Router health → `curl -fsS http://127.0.0.1:8973/health`
3. **Both:** `say -v Yelda merhaba` test çalışıyor mu
4. **Both:** Ses seviyesi + speaker
5. **Remote:** `herdr --remote <remoteHost>` kaydı oldu mu → router log'unda "register" geç

______________________________________________________________________

## Bilinen kısıtlar

- `herdr --remote <host>` cmdline imzası herdr versiyonuna göre değişebilir; `herdr --help` kontrol et.
- Telefon/tablet (thin SSH client) desteklenmez — o cihazda lokal süreç yok.
- `say` Türkçe kalitesi orta. Sonraki adım: `lib/speak.mjs` arkasına **Piper `tr_TR-dfki`** veya **Orpheus Türkçe** motoru takılabilir.
- Remote timeout başarısız ise host'ta fallback olarak konuşur.

______________________________________________________________________

## Geliştirme

```sh
node --test          # testler
```

Tasarım ve uygulama planı: `docs/specs/` ve `docs/plans/`.
