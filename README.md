# herd-voice

Claude Code done/blocked → aktif cihazda Türkçe sesli özet (say -v Yelda).

## Host (Mac, Claude buradan koşar)

`./install.sh` → config+token, launchd router, Claude hook'ları, herdr plugin.

## Remote (away-laptop)

1. repoyu klonla
2. `./install-remote.sh 100.109.4.84 <host-token>`
3. attach: `./bin/hr mac-m4` (herdr --remote + sesi bu cihaza yönlendirir)

## Aç/kapa

herdr içinde `prefix+shift+v`, ya da `herdr plugin action invoke toggle --plugin ensar.herd-voice`.
