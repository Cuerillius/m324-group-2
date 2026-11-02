FROM oven/bun:1.3-alpine
WORKDIR /app
ENV NODE_ENV=production

# Every workspace manifest has to be present for a frozen install of the lockfile.
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/locations/package.json ./services/locations/
COPY services/properties/package.json ./services/properties/
RUN bun install --frozen-lockfile --production --filter @m324/properties

# Bun runs TypeScript directly, so there is no build step.
COPY packages/shared ./packages/shared
COPY services/properties ./services/properties

WORKDIR /app/services/properties
USER bun
EXPOSE 3002
CMD ["bun", "src/index.ts"]
