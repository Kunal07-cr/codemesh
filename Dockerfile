FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY . .

RUN npm ci \
  && npm run build \
  && npm run typecheck \
  && npm test \
  && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    API_PORT=10000 \
    DATA_PATH=/app/storage/codemesh.json

WORKDIR /app

COPY --from=build /app /app

RUN mkdir -p /app/storage \
  && chown -R node:node /app/storage

USER node

EXPOSE 10000

STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.API_PORT || 10000) + '/api/ready').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["npm", "run", "start", "-w", "@codemesh/api"]

