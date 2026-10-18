# syntax=docker/dockerfile:1

# Build the web app.
FROM node:24-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts ./
COPY src ./src
# Build id the sign uses to notice updates; defaults to the build time.
ARG APP_VERSION=""
RUN APP_VERSION="${APP_VERSION}" npm run build

# Runtime: Node runs the TypeScript server directly, so only production dependencies are needed.
FROM node:24-slim
ENV NODE_ENV=production \
    TZ=Europe/Rome \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_DIR=/app/dist/web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src/shared ./src/shared
COPY src/server ./src/server
COPY --from=web /app/dist/web ./dist/web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server/index.ts"]
