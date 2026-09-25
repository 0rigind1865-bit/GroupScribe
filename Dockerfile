# Next.js standalone 容器（Fly.io 部署用）
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# standalone 自帶 server.js 與最小 node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# 公開圖檔（logo、分享預覽圖）：standalone 不會自動帶 public/
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
