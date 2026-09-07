FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY services/locations/package.json ./services/locations/
RUN pnpm install --frozen-lockfile
COPY services/locations ./services/locations
RUN pnpm --filter @m324/locations build
RUN CI=true pnpm install --prod --frozen-lockfile

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/locations/node_modules ./services/locations/node_modules
COPY --from=build /app/services/locations/dist ./services/locations/dist
COPY --from=build /app/services/locations/package.json ./services/locations/
USER node
EXPOSE 3001
CMD ["node", "services/locations/dist/index.js"]
