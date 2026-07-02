# Clash Front MVP — single-container deploy (world server + client)
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile && pnpm -r build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app ./
# world data (geometry + rosters); save.json is written next to them (mount a volume to persist)
COPY data/demo-world.json data/CHARACTER_ROSTER.csv ./data/
ENV PORT=8080 WORLD_SEED=mvp-july7 TICK_MS=5000 NODE_ENV=production
EXPOSE 8080
VOLUME ["/app/data"]
CMD ["node", "apps/server/dist/src/main.js"]
