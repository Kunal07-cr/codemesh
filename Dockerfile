FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY . .

RUN npm ci \
  && npm run build \
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

CMD ["npm", "run", "start", "-w", "@codemesh/api"]

