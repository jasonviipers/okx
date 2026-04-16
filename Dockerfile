FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
RUN corepack enable
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --prod --frozen-lockfile; else pnpm install --prod --no-frozen-lockfile; fi

FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY --from=deps /app/node_modules ./node_modules
RUN corepack enable
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install --no-frozen-lockfile; fi

COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

COPY --from=builder /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
