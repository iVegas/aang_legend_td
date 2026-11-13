ARG NODE_VERSION=26

# ── deps: the only stage that talks to the npm registry ────────────────
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ── dev: toolchain + source, used by the `dev` and `check` services ────
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ── build: production bundles for client and server ────────────────────
FROM dev AS build
# The web container proxies /api to the server, so the client talks to its own origin.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build && npm run build:server

# ── server: one JS file on a bare Node image, no node_modules ──────────
FROM node:${NODE_VERSION}-alpine AS server
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DB_PATH=/data/aether-nations.sqlite
COPY --from=build /app/dist-server/server.js ./server.js
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]

# ── web: static PWA behind nginx ───────────────────────────────────────
FROM nginx:alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
