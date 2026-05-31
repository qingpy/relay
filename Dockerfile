# syntax=docker/dockerfile:1

# --- build: compile the SPA and bundle the proxy into one JS file ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server

# --- run: Node + the built SPA + the single-file proxy. No node_modules:
#     the proxy's only deps (hono, @hono/node-server) are bundled in. ---
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    API_PORT=8787 \
    RELAY_DATA_FILE=/data/relay.json \
    RELAY_SECRETS_FILE=/data/secrets.json \
    RELAY_BACKUP_DIR=/data/backups

# All persistent state — the data snapshot, secrets, and backups — lives in
# one mounted volume the user owns.
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

# server-dist/index.js resolves the SPA at ../dist, so keep them siblings.
COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.API_PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server-dist/index.js"]
