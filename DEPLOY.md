# Deploying Relay on an Oracle Cloud VPS

This walks you through hosting Relay on your **Oracle Cloud "Always Free" Ampere
A1** box (the 4-core / 24 GB ARM shape) so it's reachable from anywhere over
HTTPS. It assumes you've **never done this before** — every step is spelled out.

**How it fits together:** one small Node process serves both the app *and* the
`/api` proxy on a single port (so there's zero CORS to fight). **Caddy** sits in
front of it and handles HTTPS automatically. A built-in **password gate**
protects the whole thing (the proxy holds your API keys, so a public host must
be locked down).

```
Browser ── HTTPS ──▶ Caddy (:443)  ──▶  Relay Node server (:8787)
                     auto TLS            SPA + /api proxy + auth gate
```

You'll need:

- The Oracle VM **running**, and its **public IP** (OCI console → your instance).
- **SSH access** to it (you set this up when you created the VM).
- A **domain name** pointing at that IP. No domain? Get a free subdomain in two
  minutes at <https://www.duckdns.org> — e.g. `yourname.duckdns.org`.

Throughout, replace `relay.example.com` with your real domain and run the
commands **on the VPS** (after `ssh` -ing in). The default Ubuntu login user is
`ubuntu`; if you chose Oracle Linux it's `opc` (adjust the unit file accordingly).

---

## 1. Open the firewall — **both** layers

Oracle blocks ports in **two** places. You must open `80` and `443` in *both*,
or the site will silently time out. This is the #1 thing that trips people up.

### 1a. The cloud firewall (OCI console)

In the Oracle Cloud web console:

1. Open your instance → click its **Virtual Cloud Network (VCN)**.
2. **Security Lists** → the **Default Security List**.
3. **Add Ingress Rules** — add two:
   - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **80**
   - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **443**

### 1b. The instance firewall (iptables)

Oracle's images also ship a local `iptables` firewall that rejects everything
except SSH. Open the two ports and persist the change:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

> The `6` inserts the rules *above* Oracle's catch-all REJECT. If port 80/443
> still hangs after everything below, run `sudo iptables -L INPUT --line-numbers`
> and make sure your two ACCEPT lines come **before** the `REJECT` line.

---

## 2. Install Node, Caddy, and git

```bash
# Node 22 (ARM64 build comes from NodeSource automatically)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Caddy (web server that does automatic HTTPS)
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

Check Node is v20+: `node -v`.

---

## 3. Get the code and build it

```bash
sudo mkdir -p /opt/relay
sudo chown "$USER":"$USER" /opt/relay
git clone https://github.com/qingpy/relay.git /opt/relay
cd /opt/relay

npm ci          # install dependencies (this can take a minute on ARM)
npm run build   # type-check + build the app into dist/
```

---

## 4. Create the config / secrets file

Copy the template and edit it:

```bash
cp deploy/relay.env.example /opt/relay/.env
nano /opt/relay/.env        # fill in the values, then Ctrl+O, Enter, Ctrl+X
chmod 600 /opt/relay/.env   # keep it private
```

At minimum set a strong **`RELAY_AUTH_USER` / `RELAY_AUTH_PASS`** — this is the
login that protects your whole instance. You can leave the provider keys blank
and enter them in the app's Settings instead (they're stored in your browser).

Make the backup directory:

```bash
mkdir -p /opt/relay/backups
```

---

## 5. Run it as a service (starts on boot, restarts on crash)

```bash
sudo cp deploy/relay.service /etc/systemd/system/relay.service
# If you're NOT on the "ubuntu" user (e.g. Oracle Linux = "opc"), edit the
# User=/Group= lines first:  sudo nano /etc/systemd/system/relay.service
sudo systemctl daemon-reload
sudo systemctl enable --now relay
sudo systemctl status relay        # should say "active (running)"
```

Quick local check (still on the VPS):

```bash
curl -u "you:yourpass" http://127.0.0.1:8787/api/health
# -> {"ok":true,"service":"relay-proxy",...}
```

If something's wrong, read the logs: `journalctl -u relay -e`.

---

## 6. Point your domain at it with Caddy

First make sure your domain's **A record** points at the VPS public IP (in your
DNS provider, or the DuckDNS dashboard). Then:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile     # replace relay.example.com with your domain
sudo systemctl reload caddy
```

Caddy will fetch a Let's Encrypt certificate within a few seconds. Watch it with
`journalctl -u caddy -e` if you're curious.

---

## 7. Open it

Visit **https://relay.example.com**. Your browser will ask for the
`RELAY_AUTH_USER` / `RELAY_AUTH_PASS` you set — enter them once and you're in.
Add a connection + API key in Settings and start chatting.

---

## Updating to a newer version

```bash
cd /opt/relay
git pull
npm ci
npm run build
sudo systemctl restart relay
```

(Your chats live in the browser's IndexedDB and aren't touched by updates. Use
**Settings → Backup → Download** now and then for a portable copy, or "Back up
to server" to write one into `/opt/relay/backups`.)

---

## Security notes

- The **auth gate is the only thing between the internet and your API keys** —
  use a long, random password. Credentials only ever travel over HTTPS (Caddy
  redirects http→https).
- `/opt/relay/.env` and `/opt/relay/backups/` contain secrets in plaintext.
  They're `chmod`-restricted and gitignored; don't loosen that.
- Scheduled backups only run while a browser tab is open (the data lives in the
  browser, not the server).
- To rotate the password: edit `/opt/relay/.env`, then `sudo systemctl restart
  relay`.
