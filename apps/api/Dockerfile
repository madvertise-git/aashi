# The API image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t aashi-api .
# The same image runs the API (default), migrations and the one-off database bootstrap.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @aashi/api...
COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter @aashi/api build

FROM base AS run
# Amazon's certificate authorities for RDS, so database connections can verify the server.
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds-global-bundle.pem
ENV NODE_ENV=production NODE_EXTRA_CA_CERTS=/etc/ssl/rds-global-bundle.pem
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
