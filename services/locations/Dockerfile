FROM oven/bun:1.3-alpine
WORKDIR /app
ENV NODE_ENV=production

# Every workspace manifest has to be present for a frozen install of the lockfile.
COPY package.json bun.lock tsconfig.base.json ./
COPY services/locations/package.json ./services/locations/
COPY services/properties/package.json ./services/properties/
RUN bun install --frozen-lockfile --production --filter @m324/locations

# Bun runs TypeScript directly, so there is no build step.
COPY services/locations ./services/locations

WORKDIR /app/services/locations
USER bun
EXPOSE 3001
CMD ["bun", "src/index.ts"]
