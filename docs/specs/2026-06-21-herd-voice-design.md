# herd-voice — Tasarım Dokümanı (Spec)

- **Tarih:** 2026-06-21
- **Durum:** Onaylandı (uygulamaya hazır)
- **Hedef makineler:** host = MacBook Pro M4 Pro (Claude Code hep burada koşar), remote = başka bir Mac/laptop
- **Bağlantı:** herdr `--remote` (away-laptop'ta native client süreci), cihazlar arası **Tailscale** mesh

## 1. Amaç

Claude Code bir işi bitirdiğinde, **o an oturduğun cihazda** kısa bir Türkçe sesli özet duymak. Yereldeyken host Mac'ten, remote'dan `herdr --remote` ile bağlıyken away-laptop'tan çalmalı.

VoiceInk (STT) girişi zaten çözüyor; bu proje yalnızca **çıkış (TTS)** içindir.

## 2. Gereksinimler / Kararlar

| #   | Karar                                                                                         |
| --- | --------------------------------------------------------------------------------------------- |
| R1  | Tetik: Claude **iş bitince (done)** ve **onay/girdi beklerken (blocked)**.                    |
| R2  | İçerik: 1-2 cümlelik Türkçe özet. Özeti **hook'un kendisi** üretir (Claude'a ek talimat yok). |
| R3  | Oynatma cihazı = "o an aktif herdr client'ı önünde oturulan makine".                          |
| R4  | Ses motoru (v1): macOS `say -v Yelda` (her iki Mac'te hazır, sıfır kurulum).                  |
| R5  | Transport: Tailscale üstünden doğrudan HTTP.                                                  |
| R6  | Paketleme: **herdr plugin** (router'ı yönetir + toggle/keybind/durum).                        |
| R7  | Diller (hibrit): daemon'lar + Claude hook'ları **Node.js**; attach-wrapper **Bash**.          |

## 3. Mimari ve Akış

```
[Claude Code @ host Mac] iş bitirir / onay bekler
        │  (Stop hook = done,  Notification hook = blocked)
        ▼
  speak-summary.mjs / notify-cue.mjs   (Node, Claude hook)
        │  son asistan mesajını al → özetle → POST /speak {text, token}
        ▼
  voice-router  (Node daemon @ host, <host-ts-ip>:8973)   ── herdr plugin tarafından başlatılır
        │
        ├─ aktif remote sink kayıtlı?  ── HAYIR ──▶  lokal konuş:  say -v Yelda
        │
        └─ EVET ──▶ Tailscale üstünden POST http://<remote-ts-ip>:8973/speak
                          │  (timeout ~1.5s)
                          ├─ başarılı ─▶ voice-sink.mjs @ away-laptop → say -v Yelda
                          └─ başarısız ─▶ kaydı temizle + lokal say  (fallback)
```

"Aktif cihaz" bilgisi herdr'in iç API'sine **bağlı değildir**; away-laptop'ta `hr` wrapper'ı attach anında kendini router'a kaydeder, detach'te siler (+ TTL emniyeti + forward-timeout fallback).

## 4. Bileşenler (her biri tek amaçlı, ayrı test edilebilir)

### 4.1 `speak-summary.mjs` — Claude Stop hook (host, Node)

- **Ne yapar:** Claude "done" olunca son asistan mesajını sesli özete çevirir.
- **Girdi:** stdin'den Claude Code Stop hook JSON'u (`transcript_path`, `session_id`, `stop_hook_active`).
- **İş:** transcript (JSONL) içinden **son `assistant` mesajının** metnini al → `summarize()` → `enabled` ve `token`'ı `~/.config/herd-voice/config.json`'dan oku → `POST http://<host-ts-ip>:8973/speak` (adres `config.host:port`).
- **Bağımlılık:** Node stdlib (`fs`, `http`). `enabled=false` veya boş özet ise sessiz çık.

### 4.2 `notify-cue.mjs` — Claude Notification hook (host, Node)

- **Ne yapar:** Claude onay/girdi beklerken (blocked) kısa sabit ipucu okutur.
- **Girdi:** stdin'den Notification hook JSON'u (mesaj alanı).
- **İş:** sabit/parametreli kısa metin (varsayılan: "Onayın gerekiyor.") → `POST /speak`.

### 4.3 `voice-router.mjs` — host daemon (Node)

- **Ne yapar:** Gelen metni **aktif sink'e** yönlendirir; aktif remote yoksa lokal konuşur.
- **Dinleme:** host Tailscale arayüz IP'si `:8973` (+ opsiyonel `127.0.0.1`). Lokal Claude hook'ları `config.host` üzerinden, remote `hr` wrapper'ı Tailscale üstünden `/register` için buraya ulaşır. Token zorunlu.
- **Endpoint'ler:**
  - `POST /speak {text}` → routing.
  - `POST /register {ip, ttl?}` → aktif remote sink'i ayarla (varsayılan TTL 3600s emniyet).
  - `POST /deregister` → remote kaydı sil (host'a geri düş).
  - `GET /health` → ok.
- **Routing:** remote kayıtlı & TTL içinde → Tailscale'e forward (~1.5s timeout). Hata/timeout → kaydı temizle + `lib/speak`. Remote yok → `lib/speak`.
- **Token:** tüm POST'larda `X-Voice-Token` zorunlu.

### 4.4 `voice-sink.mjs` — away-laptop daemon (Node)

- **Ne yapar:** Aldığı metni o cihazda seslendirir.
- **Dinleme:** Tailscale arayüz IP'si `:8973` (public değil). `POST /speak {text}` + token → `lib/speak`.

### 4.5 `lib/` (paylaşılan, Node)

- `speak.mjs` — `say -v Yelda` çağrısı; **seri kuyruk** (yeni metin öncekini beklesin), boş metin atla, çok uzunsa cap. Saf yan-etki modülü.
- `summarize.mjs` — **saf fonksiyon**: markdown/kod-bloğu temizle → boşluk sıkıştır → ≤240 char ise olduğu gibi, değilse ilk 1-2 cümle (`. ! ? …` ayrımı) → cap. Prose kalmazsa fallback ipucu ("Tamamlandı.").
- `config.mjs` — `~/.config/herd-voice/config.json` oku (token, host (Tailscale hostname/IP), port, voice, enabled).

### 4.6 `bin/hr` — attach wrapper (away-laptop, Bash)

- **Ne yapar:** Remote'a bağlanırken o cihazı "aktif" yapar.
- **Akış:** lokal `voice-sink`'i başlat (koşmuyorsa) → host router'a `POST /register {ip=<bu cihazın Tailscale IP'si>}` → `exec herdr --remote <host>` → `trap EXIT` ile `POST /deregister`.

### 4.7 herdr plugin paketi (`herdr-plugin.toml` + action script'leri)

- **Runtime command:** `voice-router`'ı başlat/denetle (host'ta).
- **Actions:** `enable` / `disable` / `toggle` → `~/.config/herd-voice/config.json` içindeki `enabled`'ı yazar; terminal title `🔈 on` / kapalı göstergesi (Telegram örneğindeki desen).
- **Keybind:** `prefix+shift+v` → `toggle`.
- **Not:** v1 tetikleyici Claude hook'larıdır; herdr event hook'u tetik için **kullanılmaz** (temiz metin Claude tarafında). herdr plugin yalnızca router yaşam döngüsü + aç/kapa + durum sağlar.

## 5. Konfig ve Güvenlik

- Ortak konfig: `~/.config/herd-voice/config.json` (herdr env'inden bağımsız; Claude hook'ları da okur). Alanlar: `token`, `host` (Tailscale hostname), `port` (8973), `voice` ("Yelda"), `enabled`.
- `token`: paylaşılan secret, `X-Voice-Token` header'ında. Hem router (host) hem sink'ler Tailscale arayüzüne bind (router'a opsiyonel `127.0.0.1`); public/LAN'a açık değil. Tek kullanıcı + mesh içi → yeterli.

## 6. Hata Yönetimi

- Remote kayıtlı ama erişilemez (laptop uykuda / wrapper çöktü) → forward timeout → kaydı temizle + lokal `say`.
- TTL emniyeti: bayat remote kaydı süre dolunca otomatik düşer.
- Üst üste konuşma → `lib/speak` seri kuyruk.
- Boş/yalnız-kod cevap → özet fallback ipucu, asla boş `say` değil.
- `enabled=false` → hook'lar sessiz çıkar.

## 7. nvm / PATH Notu

node nvm altında (`~/.nvm/.../bin/node`). herdr plugin komutu ve Claude hook'ları login olmayan ortamda PATH'te node bulamayabilir. **Çözüm:** `install.sh` kurulum anında `command -v node` mutlak yolunu tespit edip hem herdr manifest komutuna hem Claude hook komutlarına bu mutlak yolu gömer (shebang yerine `<abs-node> script.mjs`).

## 8. Test Stratejisi

- **Birim:** `summarize.mjs` (saf) — kod temizleme, cümle çıkarımı, cap, fallback (`node:test`).
- **Birim:** `lib/speak` — `say` spawn mock'u; kuyruk serileştirme.
- **Entegrasyon:** router routing — `/register` sonrası mock remote'a forward; unreachable/expire → lokal fallback; token reddi.
- **Manuel kabul:**
  1. Lokal: host'ta Claude'a kısa iş yaptır → sesi host'tan duy.
  2. Remote: laptop'tan `hr` ile bağlan → Claude'a iş yaptır → sesi **laptop'tan** duy.
  3. blocked: onay isteyen komut → "Onayın gerekiyor." ipucu doğru cihazda.
  4. toggle: `prefix+shift+v` → sustur/aç.

## 9. Proje Yapısı

```
~/Projects/herd-voice/
  herdr-plugin.toml
  src/
    voice-router.mjs
    voice-sink.mjs
    speak-summary.mjs        # Claude Stop hook
    notify-cue.mjs           # Claude Notification hook
    lib/{speak.mjs,summarize.mjs,config.mjs,http.mjs}
  bin/hr                     # bash attach wrapper
  plugin/actions/{enable,disable,toggle}.sh
  test/summarize.test.mjs
  install.sh                 # config + claude hooks + herdr plugin + abs-node pinleme
  docs/specs/2026-06-21-herd-voice-design.md
  README.md
```

## 10. Kapsam Dışı (v1) / Gelecek

- Piper `tr_TR-dfki` / Orpheus Türkçe motoruna geçiş (pluggable `lib/speak` backend).
- Telefon/tablet (thin SSH client) desteği — orada lokal süreç yok; bulut TTS gerekir.
- herdr native client on-attach hook çıkarsa `hr` wrapper'ı onunla değiştir.
- herd farkındalığı: codex/diğer agent'lar için herdr event tetikleyici.
- Akışkan/parçalı (streaming) konuşma.

## 11. Doğrulanacak Açık Konular (uygulama başında)

1. Claude Code **Stop** ve **Notification** hook JSON şeması + transcript JSONL formatı (claude-code-guide ile teyit).
2. herdr `herdr-plugin.toml` tam şeması + runtime command yaşam döngüsü (herdr docs/CLI ile teyit).
3. herdr plugin komutunun miras aldığı PATH (nvm node) — §7 mutlak yol mitigasyonu yeterli mi.
4. Tailscale host/remote adres keşfi (MagicDNS hostname tercih).
