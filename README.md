# Relay

English | [中文](README.zh-CN.md)

Personal LLM chat in the browser. OpenAI-compatible APIs and Google Vertex AI.
Data is one JSON file on disk; the network is model calls and optional WebDAV.

![Demo](demo.jpeg)

## Run

Docker:

```bash
docker run -d --name relay -p 8787:8787 -v relay-data:/data \
  ghcr.io/qingpy/relay:latest
```

http://localhost:8787. Data, keys, and backups are in the `relay-data` volume
(`-v /path/on/host:/data` to put them on disk). No HTTP auth. Bind to a
network you trust.

Zip (Node 20+): download `relay-x.y.z.zip` from the
[latest release](https://github.com/qingpy/relay/releases/latest), unzip,
`node server-dist/index.js`.

From source (Node 20+):

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm run build && npm run serve` serves the UI and API together on :8787.

## Data

Default file `./data/relay.json` (path in Settings → Sync & backup). Keys,
the Vertex private key, and the WebDAV password sit in a separate file, so
the JSON can be copied without credentials.

Settings → Connections: a full `…/v1/chat/completions` URL + key, or a Vertex
service-account JSON.

WebDAV (same settings page) copies the file while the app is open; later
write wins. On-disk backups: `./backups`.

## Environment

All optional.

| Variable | Default |
| --- | --- |
| `RELAY_DATA_FILE` | `./data/relay.json` |
| `RELAY_SECRETS_FILE` | `%APPDATA%\Relay\secrets.json` or `~/.config/relay/secrets.json` |
| `API_PORT` | `8787` |
| `RELAY_BACKUP_DIR` | `./backups` |
| `OPENROUTER_KEY` / `OPENAI_KEY` | fallback key for OpenAI-style connections |
| `GOOGLE_VERTEX_CREDENTIALS` / `_FILE` | fallback Vertex service account |

Internals: [ARCHITECTURE.md](ARCHITECTURE.md).

Thanks to [linux.do](https://linux.do/).
