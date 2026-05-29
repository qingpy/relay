# Relay — live deployment (Oracle Cloud VPS)

This instance is **agent-managed from the dev machine**: the git repo is the
source of truth, and code is *shipped over SSH* (not pulled on the box), so the
server needs no GitHub credentials. For the generic, from-scratch walkthrough
see [`DEPLOY.md`](../DEPLOY.md); this file records the actual running setup.

## Facts

| | |
|---|---|
| **URL** | https://163.192.26.239.nip.io (HTTP 308-redirects to HTTPS) |
| **SSH** | `ssh Oracle-VPS` (host alias in `~/.ssh/config` on the dev machine) |
| **Host** | Ubuntu 24.04, ARM64 (Ampere A1, 4 vCPU / 24 GB), login user `ubuntu` |
| **App dir** | `/opt/relay` (deployed commit recorded in `/opt/relay/.deployed-sha`) |
| **App service** | `relay` (systemd) → Node serves the SPA **and** `/api` on `127.0.0.1:8787` |
| **Web / TLS** | `caddy` (systemd) → reverse proxy + automatic HTTPS, `/etc/caddy/Caddyfile` |
| **Auth** | HTTP Basic, user `relay`; password in `/opt/relay/.env` (**not** in git) |
| **Backups** | `/opt/relay/backups` (server-side backups land here) |
| **Firewall** | instance `ufw` allows 22/80/443; OCI security list allows 80/443 |

The `nip.io` hostname resolves `163.192.26.239.nip.io` → the IP, which lets
Caddy obtain a real Let's Encrypt cert without owning a domain.

## Update to the latest commit (from the dev machine, repo root)

```bash
bash deploy/update.sh            # ships HEAD, builds on the box, restarts, health-checks
```

Equivalent by hand:

```bash
git archive HEAD | ssh Oracle-VPS 'tar xf - -C /opt/relay'
ssh Oracle-VPS 'cd /opt/relay && npm ci && npm run build && sudo systemctl restart relay'
```

## Operate

```bash
ssh Oracle-VPS 'systemctl status relay'        # service state
ssh Oracle-VPS 'journalctl -u relay -e'        # app logs
ssh Oracle-VPS 'journalctl -u caddy -e'        # TLS / proxy logs
ssh Oracle-VPS 'sudo systemctl restart relay'  # restart the app
```

## Change the login password

```bash
ssh Oracle-VPS 'nano /opt/relay/.env'          # edit RELAY_AUTH_PASS, save
ssh Oracle-VPS 'sudo systemctl restart relay'
```

## Switch to a custom domain later

Point the domain's DNS **A record** at `163.192.26.239`, then edit
`/etc/caddy/Caddyfile` (replace the `nip.io` host with your domain) and
`sudo systemctl reload caddy` — Caddy fetches a new cert automatically.

## Notes

- Provider **API keys live in the browser** (entered in Settings); none are
  required on the server. The optional `OPENROUTER_KEY` / `OPENAI_KEY` /
  `GOOGLE_VERTEX_CREDENTIALS*` env vars in `.env` are server-side fallbacks only.
- `/opt/relay/.env` and `/opt/relay/backups/` hold secrets in plaintext — keep
  them private (they're `chmod 600` / gitignored respectively).
- Chats live in the browser's IndexedDB, not on the server; use **Settings →
  Backup** for portable copies.
