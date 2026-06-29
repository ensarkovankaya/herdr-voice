# Remote setup (audio follows you)

By default herdr-voice speaks on the host where Claude Code runs. If you often
connect to that host from another machine with `herdr --remote`, you can have
the audio play on **that** machine instead, automatically, for as long as the
remote session is live. This page explains the roles, pairing, and the presence
mechanism. For the design rationale see
[architecture.md](architecture.md#presence-how-audio-follows-you).

## Roles

| Role       | Runs                            | Daemon                              | Installed with          |
| ---------- | ------------------------------- | ----------------------------------- | ----------------------- |
| **host**   | the machine Claude Code runs on | `voice-router.mjs`                  | `./install.sh`          |
| **remote** | a machine you connect *from*    | `voice-sink.mjs` + presence watcher | `./install.sh remote …` |

One machine can only hold one role's daemon at a time. The host always speaks
locally when no remote is present.

## Prerequisites

- A **[Tailscale](https://tailscale.com) mesh** joining the two machines (audio
  is forwarded over the tailnet).
- `node`, `jq`, `curl` on both; `tailscale` on the remote (optional — the sink
  reads its tailnet IP directly from the network interfaces and only falls back
  to the CLI).
- The host already installed and running (`herdr-voice status` → `running`).

## Pairing

The two sides authenticate with a **shared token** — the host's token must be
copied to the remote.

**1. On the host, read the token and its Tailscale IP:**

```sh
jq -r .token ~/.herdr-voice/config.json     # the shared secret
tailscale ip -4                             # the host's tailnet IP (100.x.y.z)
```

**2. On the remote, install with that IP and token:**

```sh
git clone https://github.com/ensarkovankaya/herdr-voice.git
cd herdr-voice
./install.sh remote <HOST_TAILSCALE_IP> <TOKEN> [HOST]
```

- `<HOST_TAILSCALE_IP>` — becomes `host` in the remote's config; the sink talks
  to the router there.
- `<TOKEN>` — must match the host exactly.
- `[HOST]` *(optional)* — sets `remoteHost`, scoping which
  `herdr --remote <host>` session counts as "you're here". Omit to match **any**
  `--remote` session. Use it when you connect to several different hosts and
  only want one of them to route audio here.

```sh
./install.sh remote 100.101.102.103 0a1b2c3d4e5f… my-host-magicdns
```

**3. Connect.** Audio routes to the remote automatically while the session is
live:

```sh
herdr --remote my-host-magicdns
```

## What happens under the hood

1. The remote's presence watcher polls (~7 s) for a local `herdr --remote`
   process (matching `remoteHost` if set).
2. When found, it `POST /register {ip, port}` to the host router with its
   tailnet IP, refreshing every ~30 s (heartbeat).
3. The router forwards each `/speak` to that IP while the registration is live
   (within `remoteTtlMs`, default 1 h).
4. On session exit the watcher `POST /deregister`; if a forward ever fails or
   exceeds `forwardTimeoutMs`, the router drops the registration and speaks
   locally.

You can watch this on the host:

```sh
tail -f ~/.herdr-voice/logs/herdr-voice.log | grep -iE 'register|forward'
```

A live pairing looks like a `register` event (`"ip":"100.x.y.z"`) followed by
`forward` events (`"target":"100.x.y.z:8973"`) while you work.

## Troubleshooting remote routing

**Audio still plays on the host.** No live registration. Check, on the host:

```sh
tail -n 20 ~/.herdr-voice/logs/herdr-voice.log | grep -i register   # any REGISTER?
```

If none, on the remote confirm the watcher sees your session and can reach the
host:

```sh
pgrep -fl 'herdr.*--remote'                                   # is the session detected?
jq -r '.remoteHost' ~/.herdr-voice/config.json               # matches your --remote host?
curl -fsS "http://$(jq -r .host ~/.herdr-voice/config.json):8973/health"   # router reachable?
```

**401 / nothing forwarded.** Tokens differ. Re-copy the host token into the
remote config and `herdr-voice restart` on the remote.

**No tailnet IP found** (`presence register skipped` in the remote log). The
machine has no `100.64.0.0/10` address — confirm `tailscale status` shows it
connected.

**Audio plays on the wrong remote.** Set `remoteHost` on each remote so only the
intended host's `--remote` session registers it.

See [troubleshooting.md](troubleshooting.md) for the general no-sound checklist.
