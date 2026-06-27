# herd-voice

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

**"Aktif cihaz"** = o an herdr client'ının önünde oturduğun makine. Remote'a `bin/hr` ile bağlandığında o cihaz kendini host router'a kaydeder (`/register`), çıkışta siler (`/deregister`). Kayıt yoksa/zaman aşımına uğramışsa router host'ta konuşur. Bu bilgi herdr'ın iç API'sine **bağlı değildir** (register + TTL + forward-timeout fallback ile yürür).

### Bileşenler

| Dosya                             | Rol                                                                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/voice-router.mjs`            | **Host daemon.** `/speak`'i alır, aktif cihaza yönlendirir; `/register`·`/deregister` ile remote sink'i tutar; remote erişilemezse lokal `say`'e düşer. launchd ile her zaman açık. |
| `src/voice-sink.mjs`              | **Cihaz daemon'u.** `/speak {text}` → `say -v Yelda`. Away-laptop'ta `bin/hr` başlatır.                                                                                             |
| `src/speak-summary.mjs`           | **Claude Stop hook.** Transcript'ten son asistan mesajını alır → `summarize` → router'a POST. Asla throw etmez (Claude'u bloklamaz).                                                |
| `src/notify-cue.mjs`              | **Claude Notification hook.** Onay/girdi beklenirken sabit kısa ipucu ("Onayın gerekiyor.").                                                                                        |
| `src/lib/summarize.mjs`           | Markdown/kod temizler, ≤240 karaktere ilk cümle(ler)e indirger, boş/kod-only ise "Tamamlandı."                                                                                      |
| `src/lib/{config,http,speak}.mjs` | config yükleyici · küçük HTTP yardımcıları · seri `say` kuyruğu.                                                                                                                    |
| `bin/hr`                          | **Away-laptop attach sarmalayıcısı.** Lokal sink'i açar → host router'a register → `herdr --remote <host>` → çıkışta deregister.                                                    |
| `plugin/`                         | **herdr plugin** (`ensar.herd-voice`): toggle/enable/disable action'ları + durum.                                                                                                   |
| `launchd/…router.plist.tmpl`      | Host router'ı launchd user-agent olarak çalıştıran şablon (`@NODE@`/`@ROOT@` install.sh ile doldurulur).                                                                            |

Diller: daemon'lar + Claude hook'ları **Node.js** (sıfır npm bağımlılığı, sadece stdlib), wrapper + plugin action'ları **Bash**.

______________________________________________________________________

## Ön koşullar

- macOS (Apple Silicon veya Intel), Türkçe ses: `say -v Yelda` çalışmalı.
- **herdr ≥ 0.7.0** (plugin API; `herdr update`).
- `node` (nvm olabilir — install.sh mutlak yolu hook'lara/launchd'ye gömer), `jq`, `curl`, `tailscale`.
- Cihazlar arası **Tailscale** mesh (remote senaryosu için).

______________________________________________________________________

## Kurulum

### Host (Claude buradan koşar)

```sh
./install.sh
```

Yaptıkları:

1. `~/.config/herd-voice/config.json` oluşturur ve **token üretir** (varsa ve token eksikse token'ı yamalar).
2. Claude Stop + Notification hook'larını `~/.claude/settings.json`'a **idempotent** ekler (mevcut hook'ları korur).
3. launchd router'ı yükler (`~/Library/LaunchAgents/dev.ensar.herd-voice.router.plist`) ve health-check eder.
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
./install-remote.sh <HOST_TS_IP> <HOST_TOKEN>     # ör: ./install-remote.sh 100.109.4.84 <token>
./bin/hr <host-alias>                              # ör: ./bin/hr mac-m4  → herdr --remote + sesi bu cihaza yönlendirir
```

`<HOST_TOKEN>` = host'taki `jq -r .token ~/.config/herd-voice/config.json`. Token iki tarafta **aynı** olmalı.

______________________________________________________________________

## Konfigürasyon

`~/.config/herd-voice/config.json` (override: `HERD_VOICE_CONFIG` env):

| Alan               | Varsayılan          | Açıklama                                                                                        |
| ------------------ | ------------------- | ----------------------------------------------------------------------------------------------- |
| `token`            | —                   | Paylaşılan secret; `X-Voice-Token` header'ında. Host ve remote'ta aynı.                         |
| `host`             | `127.0.0.1`         | Bu makinenin gördüğü **router adresi**. Host'ta `127.0.0.1`; remote'ta host'un Tailscale IP'si. |
| `port`             | `8973`              | Router/sink portu.                                                                              |
| `voice`            | `Yelda`             | `say -v` sesi.                                                                                  |
| `enabled`          | `false`             | Hook'lar yalnız `true` iken konuşur (router/toggle her zaman çalışır).                          |
| `remoteTtlMs`      | `3600000`           | Remote kaydının emniyet süresi.                                                                 |
| `forwardTimeoutMs` | `1500`              | Router→remote sink forward timeout'u.                                                           |
| `postTimeoutMs`    | `1500`              | Hook→router POST timeout'u.                                                                     |
| `cue`              | `Onayın gerekiyor.` | Notification (blocked) ipucu metni.                                                             |

Sesi değiştirmek: `voice` alanını güncelle + router'ı yeniden başlat (`launchctl kickstart -k gui/$(id -u)/dev.ensar.herd-voice.router`).

______________________________________________________________________

## Kullanım

### Aç / kapa

- herdr içinde **`prefix+shift+v`**, ya da CLI: `herdr plugin action invoke toggle --plugin ensar.herd-voice` (`enable`/`disable` de var).
- Toggle, **sesli onay** çalar ("Ses açıldı" / "Ses kapandı") — aktif cihazda. Terminal başlığını da `🔈 herd-voice on` / `herd-voice off` yapar.

### Claude statusLine göstergesi

Status bar'da ses durumunu görmek için (`🔈 ses` açık / `🔇 ses` kapalı), Claude statusLine script'ine bir segment ekle.

**A) Bu repodaki segment'i çağır:**

```sh
seg=$("$HOME/Projects/herd-voice/statusline/herd-voice-segment.sh")   # "🔈 ses" / "🔇 ses"
```

**B) Ya da kendi statusLine script'ine renkli inline snippet ekle** (`~/.claude/settings.json`'daki `statusLine.command`'in işaret ettiği script'e):

```bash
hv=$(jq -r '.enabled // false' "$HOME/.config/herd-voice/config.json" 2>/dev/null)
if [ "$hv" = "true" ]; then printf '  \033[2;32m🔈 ses\033[0m'
else                        printf '  \033[2;90m🔇 ses\033[0m'; fi
```

> statusLine script'i Claude Code'a aittir (repo dışı, ör. `~/.claude/statusline-command.sh`); her refresh'te yeniden çalışır, ekstra reload gerekmez.

______________________________________________________________________

## Güvenlik

- Her istek `X-Voice-Token` ister; token'sız hiçbir yol `say`'e ulaşmaz (`/health` hariç, o da konuşmaz).
- Router/sink `0.0.0.0:8973` dinler ama yalnız **Tailscale mesh + token** ile korunur (tek kullanıcı senaryosu için yeterli). Tailscale ACL / firewall önerilir.

______________________________________________________________________

## Sorun giderme

```sh
# Router ayakta mı?  (curl context-mode'a takılırsa node/tarayıcı ile dene)
curl -fsS http://127.0.0.1:8973/health        # {"ok":true}

# Router logları
tail -f ~/Projects/herd-voice/router.out.log ~/Projects/herd-voice/router.err.log

# Plugin action geçmişi (toggle çalıştı mı, çıktı/exit)
herdr plugin log list --plugin ensar.herd-voice

# Ses açık mı?
jq .enabled ~/.config/herd-voice/config.json

# Router'ı yeniden başlat (config/token değişince)
launchctl kickstart -k "gui/$(id -u)/dev.ensar.herd-voice.router"

# Manuel sesli test
TOKEN=$(jq -r .token ~/.config/herd-voice/config.json)
# (curl yoksa/engelliyse node ile POST: http://127.0.0.1:8973/speak, header x-voice-token)
```

Ses gelmiyorsa kontrol listesi: `enabled=true` mı · router health · `say -v Yelda merhaba` çalışıyor mu · ses seviyesi · (remote'da) `bin/hr` register oldu mu (`router.out.log`).

______________________________________________________________________

## Bilinen kısıtlar / yol haritası

- `bin/hr` tek `port` değişkenini hem host router hem lokal sink için kullanır → host ve remote port'u **aynı** olmalı (varsayılan 8973'te sorun yok).
- Telefon/tablet (thin SSH client) desteklenmez — o cihazda lokal süreç yok.
- `say` Türkçe kalitesi orta. Sonraki adım: `lib/speak.mjs` arkasına **Piper `tr_TR-dfki`** veya **Orpheus Türkçe** motoru takılabilir.

______________________________________________________________________

## Geliştirme

```sh
node --test          # 22 test, sıfır npm bağımlılığı
```

Tasarım ve uygulama planı: `docs/specs/` ve `docs/plans/`.
