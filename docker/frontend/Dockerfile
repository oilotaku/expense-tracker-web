# Next.js standalone；NODE_VERSION / NEXT_PUBLIC_API_URL / APP_ENV 由 docker-compose.yml 傳入
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG APP_ENV
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    APP_ENV=${APP_ENV}
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
RUN npm run build

FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=UTC
# upgrade：基礎 image 發布後 Alpine 才出的安全修補要在 build 時補上，否則 container-scan（→ CICD-035）擋下。
# 移除 npm：runtime 只跑 `node server.js`，npm 用不到，但它內建的依賴（tar / brace-expansion 等）
# 舊版會被 trivy 判定為 HIGH 漏洞。
RUN apk upgrade --no-cache \
    && npm uninstall -g npm
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
ENV PORT=3000 \
    HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
