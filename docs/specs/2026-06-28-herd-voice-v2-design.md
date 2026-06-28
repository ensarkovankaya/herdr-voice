# herd-voice v2 — Tasarım Dokümanı (Spec)

- **Tarih:** 2026-06-28
- **Durum:** Onaylandı (uygulamaya hazır)
- **Önceki:** v1 (`docs/specs/2026-06-21-herd-voice-design.md`) çalışıyor; bu, onun servis-leştirilmiş v2'si.

## 1. Amaç

herd-voice'u yönetilebilir bir servise dönüştürmek: tek app dizini, PATH'te CLI (`herdr-voice start/stop/restart/status/logs/enable/disable`), startup'ta otomatik çalışma, rotate'li loglama, ve **`hr` olmadan** "bulunduğun cihazda ses" (presence-aware otomatik kayıt). Hem host (mac-m4) hem remote (mac-m2) aynı düzende.

## 2. Kararlar (özet)

| #   | Karar                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Komut adı: **`herdr-voice`**                                                                                                      |
| K2  | CLI konumu: **`~/.local/bin/herdr-voice`**                                                                                        |
| K3  | App dizini: **`~/.herdr-voice/`** (config + src + logs)                                                                           |
| K4  | Kapsam: **host + remote uniform**, `role` ile ayrışır                                                                             |
| K5  | Routing: **presence-aware** — remote sink, `herdr --remote → host` oturumu açıkken otomatik register/deregister. `hr` kaldırılır. |
| K6  | Log: rotate'li, **~1MB × 5 dosya**, `~/.herdr-voice/logs/herdr-voice.log`                                                         |
| K7  | Startup: launchd agent `dev.ensar.herdr-voice`                                                                                    |
| K8  | Eski kurulum (`~/.config/herd-voice`, eski launchd label) migrasyon sonrası **silinir**                                           |
| K9  | plugin id `ensar.herd-voice` **korunur** (keybind churn olmasın)                                                                  |

## 3. Dizin düzeni (`~/.herdr-voice/`, her iki makinede)

```
~/.herdr-voice/
  config.json
  src/                 # install'da repodan kopyalanır
    voice-router.mjs voice-sink.mjs speak-summary.mjs notify-cue.mjs
    lib/{config,http,speak,summarize,logger,presence}.mjs
  logs/
    herdr-voice.log (+ .1 … .5)
```

Repo (`~/Projects/herd-voice`) = kaynak/dev. `~/.herdr-voice` = kurulu runtime (CLI ve launchd buraya bakar).

## 4. config.json şeması

```jsonc
{
  "token": "…",
  "host": "127.0.0.1",          // host'ta 127.0.0.1; remote'ta host router IP (100.109.4.84)
  "port": 8973,
  "voice": "Yelda (Enhanced)",
  "enabled": true,
  "role": "host" | "remote",
  "remoteHost": "mac-m4-jftf",   // sadece remote: izlenecek/register edilecek herdr --remote hedefi
  "remoteTtlMs": 3600000, "forwardTimeoutMs": 1500, "postTimeoutMs": 1500,
  "cue": "Onayın gerekiyor."
}
```

`config.mjs` default yolu artık `~/.herdr-voice/config.json` (override: `HERD_VOICE_CONFIG`).

## 5. Rol bazlı daemon

- **role=host** → `voice-router.mjs`: Claude hook'larından `/speak` alır → aktif remote kayıtlıysa Tailscale ile oraya forward, yoksa lokal `say`. Olayları loglar (FORWARD/FALLBACK/SPEAK).
- **role=remote** → `voice-sink.mjs`: `/speak {text}` → `say` (config.voice). **`enabled=false` ise düşürür** (yerel susturma). Gömülü **presence-watcher** çalıştırır.

**Canlı config:** Daemon her `/speak`'te config'i **taze okur** (küçük JSON; handler'a `getConfig()` enjekte edilir → test edilebilir). Böylece `enabled`, `voice`, `token` değişiklikleri **restart gerektirmez** (v1'deki "voice değişikliği etki etmiyor" sorununu çözer). Yalnız `port`/`bind` başlangıçta sabittir (server listen). Presence-watcher de host/remoteHost/port'u taze okur.

## 6. Presence-watcher (`lib/presence.mjs`, sink içinde)

- Her ~7sn: `pgrep -f "herdr.*--remote"` çıktısı `config.remoteHost` içeriyor mu?
- **aktif** & (kayıtlı değil veya son register > ~30sn) → host router'a `POST http://{host}:{port}/register {ip:<bu cihaz tailscale ip>, port}` (heartbeat).
- **aktif değil** & kayıtlıydı → `POST /deregister`; kayıt durumu sıfırlanır.
- `<bu cihaz tailscale ip>` = `tailscale ip -4 | head -1` (bir kez bulunup cache'lenir).
- Geçişler loglanır (REGISTER/DEREGISTER).
- Saf karar fonksiyonu `decidePresenceAction({active, registered, lastRegisterMs, now, ttlHeartbeatMs})` → `'register'|'deregister'|'noop'` (birim test edilir).

Sonuç: host kendine remote bağlanmaz → asla register olmaz → host başındayken ses host'ta; mac-m2'den `herdr --remote` ile bağlıyken ses mac-m2'de. `hr` silinir.

## 7. CLI `herdr-voice` (`~/.local/bin/herdr-voice`, bash)

`config.role`'den label/daemon/paths çözülür. Komutlar:

| Komut                | Davranış                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `start`              | launchd agent'ı bootstrap/load et                                                                                              |
| `stop`               | bootout/unload                                                                                                                 |
| `restart`            | `launchctl kickstart -k`                                                                                                       |
| `status`             | çalışıyor mu (launchctl) + `enabled` + `role` + (remote) kayıtlı mı + son ~10 log satırı                                       |
| `logs`               | `tail -f logs/herdr-voice.log`                                                                                                 |
| `enable` / `disable` | **local** `config.enabled`'ı yaz + logla + onayı **doğrudan `say -v <voice>`** ile çal ("Ses açıldı/kapandı"; gate'e takılmaz) |

> `enabled` semantiği: **master switch host config'tedir** (Claude hook'ları orada kontrol eder; Claude host'ta koşar). Remote'taki `enabled` o cihazın sink'ini yerelden susturur. CLI `enable/disable` çalıştığın makinenin config'ini değiştirir.

## 8. Loglama + rotate (`lib/logger.mjs`)

- `log(level, msg)` → `~/.herdr-voice/logs/herdr-voice.log`'a `[ISO ts] [LEVEL] msg` ekler.
- Yazımdan önce dosya > ~1MB ise rotate: `.log→.log.1`, kaydır, en fazla **5** dosya tut.
- Olaylar: **START/STOP** (daemon; STOP SIGTERM handler'da), **SPEAK "<text>"** (say'e giden metin), **REGISTER/DEREGISTER** (presence), host'ta **FORWARD/FALLBACK**, **ENABLE/DISABLE** (CLI + plugin toggle).
- Toggle (bash) ve CLI aynı log dosyasına ekler (rotate'i node logger yapar; bash sadece append — kişisel kullanım için yeterli).

## 9. launchd (`dev.ensar.herdr-voice`)

`RunAtLoad + KeepAlive`, `ProgramArguments = [<abs-node>, ~/.herdr-voice/src/<router|sink>.mjs]`, `EnvironmentVariables: HERD_VOICE_BIND=0.0.0.0`, `Standard{Out,Error}Path = ~/.herdr-voice/logs/launchd.out|err.log`. install role'e göre router veya sink plist'i üretir.

## 10. Migrasyon + eski temizlik (install yapar)

1. Eski `~/.config/herd-voice/config.json` varsa → `~/.herdr-voice/config.json`'a taşı (token/voice/enabled korunur), `role` ekle, token yoksa üret.
2. Eski launchd `dev.ensar.herd-voice.router` → `launchctl bootout`/unload + plist sil.
3. Eski `~/.config/herd-voice/` dizinini sil.
4. `bin/hr` repodan silinir (artık gerekmez).

## 11. Yol yeniden bağlama (install, idempotent)

- `lib/config.mjs` default → `~/.herdr-voice/config.json`.
- Claude hook'ları (host settings.json) → `<abs-node> ~/.herdr-voice/src/{speak-summary,notify-cue}.mjs`; eski `herd-voice` hook girdileri kaldırılıp yenisi eklenir (mevcut diğer hook'lar korunur).
- statusline segment + `~/.claude/statusline-command.sh` inline snippet → yeni config yolu.
- plugin (host): `toggle.sh` yeni config yolu + log + (mevcut) router POST onayı; plugin id `ensar.herd-voice` korunur.

## 12. install betikleri (v2)

- **`install.sh`** (host): `~/.herdr-voice` kur (src kopyala, config migrate role=host) → CLI'yi `~/.local/bin/herdr-voice`'a → launchd router → Claude hook'ları + statusline + plugin yeniden bağla → §10 eski temizlik. Çıkışta `herdr-voice status`.
- **`install-remote.sh <host-ip> <token> [remoteHost=mac-m4-jftf]`** (remote): `~/.herdr-voice` kur (config role=remote, host=ip, remoteHost) → CLI → launchd sink+watcher → §10 eski temizlik. Claude hook/plugin YOK (Claude remote'ta koşmuyor).

İkisi de mutlak `node` yolunu (nvm) launchd + CLI'ye gömer.

## 13. Test

- **Birim:** `logger` (rotate eşiği/dosya sayısı), `decidePresenceAction` (saf karar tablosu), `config` (yeni default yol + role), mevcut summarize/http/speak/router/sink testleri korunur (handler'lar `getConfig()` alır; sink'e `enabled` gate + canlı `voice`/`enabled` taze-okuma testi eklenir).
- **Manuel kabul:**
  1. Host: `herdr-voice status` (role=host, çalışıyor), `restart`, `disable`/`enable` (sesli onay + statusLine değişir).
  2. Remote: `herdr --remote mac-m4-jftf` aç → log'da REGISTER → host'tan iş/`/speak` → **ses mac-m2'den**; detach → DEREGISTER → host'tan iş → **ses host'ta**.
  3. Startup: makineyi yeniden başlat / `launchctl` → agent otomatik ayağa kalkar.
  4. Log rotate: log dosyası ~1MB'ı geçince `.1…` oluşur, 5'te durur.

## 14. Kapsam dışı (v2) / gelecek

- Presence tespiti pgrep ile (herdr socket API ile değişimi gelecekte).
- Piper/Orpheus/bulut motoru (ayrı iş; `lib/speak.mjs` arkasında).
- Telefon/tablet sink.

## 15. Doğrulanacak açık konular (uygulama başında)

1. `herdr --remote` süreç imzası (pgrep deseni) — gerçek bir remote oturumda doğrula (`pgrep -fl herdr`).
2. launchd `bootstrap gui/$UID` vs `load` — mevcut macOS sürümünde çalışan biçim.
3. `~/.local/bin` PATH'te (doğrulandı: herdr orada) — login-shell olmayan launchd için CLI yine de mutlak node kullanır.
