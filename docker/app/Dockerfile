# 本番用のイメージ（docs/deploy.md）。3 つのターゲットがある
#   web     : Next.js（standalone）            docker build --target web -t rise-knowledge-web .
#   worker  : ジョブのワーカー（AI チェック・Slack）  docker build --target worker -t rise-knowledge-worker .
#   migrate : マイグレーション（DB のオーナーで実行） docker build --target migrate -t rise-knowledge-migrate .
# 秘密情報はイメージに入れない。実行時に環境変数で渡す

FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN npx next build

# --- web ---
FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 1001 --home /app app
COPY --from=build --chown=app /app/.next/standalone ./
COPY --from=build --chown=app /app/.next/static ./.next/static
COPY --from=build --chown=app /app/public ./public
# AI チェックのシステムプロンプト（実行時に読む）
COPY --from=build --chown=app /app/prompts ./prompts
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# --- worker ---
FROM deps AS worker
WORKDIR /app
ENV NODE_ENV=production COMPLIANCE_RUNNER=queue
COPY . .
RUN useradd --system --uid 1001 --home /app app && chown -R app /app
USER app
CMD ["npm", "run", "worker"]

# --- migrate ---
FROM deps AS migrate
WORKDIR /app
ENV NODE_ENV=production
CMD ["npx", "prisma", "migrate", "deploy"]
