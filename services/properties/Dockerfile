FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY services/properties/package.json ./services/properties/
RUN pnpm install --frozen-lockfile
COPY services/properties ./services/properties
RUN pnpm --filter @m324/properties build
RUN CI=true pnpm install --prod --frozen-lockfile

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/properties/node_modules ./services/properties/node_modules
COPY --from=build /app/services/properties/dist ./services/properties/dist
COPY --from=build /app/services/properties/package.json ./services/properties/
USER node
EXPOSE 3002
CMD ["node", "services/properties/dist/index.js"]
