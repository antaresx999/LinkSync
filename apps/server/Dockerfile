# LinkSync-Server
# Bauen (im Hauptordner des Projekts):  docker build -f apps/server/Dockerfile -t linksync-server .

# 1. Schritt: Code zu einer einzigen Datei bündeln
FROM node:24-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @linksync/server...
COPY packages/core packages/core
COPY apps/server apps/server
RUN pnpm --filter @linksync/server build

# 2. Schritt: schlankes Abbild nur mit dem Ergebnis
FROM node:24-alpine
LABEL org.opencontainers.image.source="https://github.com/antaresx999/LinkSync" \
      org.opencontainers.image.description="LinkSync-Server: Ende-zu-Ende verschlüsselter Lesezeichen-Sync" \
      org.opencontainers.image.licenses="GPL-3.0-only"
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATABASE_PATH=/data/linksync.sqlite
COPY --from=build /src/apps/server/dist/main.js ./main.js
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "main.js"]
