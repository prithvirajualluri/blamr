FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/types ./packages/types
COPY packages/blame ./packages/blame
COPY packages/semantic ./packages/semantic
COPY packages/ml ./packages/ml
COPY apps/workers ./apps/workers
RUN npm ci --workspace=@blamr/types --workspace=@blamr/blame --workspace=@blamr/semantic --workspace=@blamr/ml --workspace=@blamr/workers
RUN npm run build -w @blamr/types -w @blamr/blame -w @blamr/semantic -w @blamr/ml -w @blamr/workers
RUN npm ci --omit=dev --workspace=@blamr/types --workspace=@blamr/blame --workspace=@blamr/semantic --workspace=@blamr/ml --workspace=@blamr/workers

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder /app/packages/blame/dist ./packages/blame/dist
COPY --from=builder /app/packages/blame/package.json ./packages/blame/package.json
COPY --from=builder /app/packages/semantic/dist ./packages/semantic/dist
COPY --from=builder /app/packages/semantic/package.json ./packages/semantic/package.json
COPY --from=builder /app/packages/ml/dist ./packages/ml/dist
COPY --from=builder /app/packages/ml/package.json ./packages/ml/package.json
COPY --from=builder /app/apps/workers/dist ./apps/workers/dist
COPY --from=builder /app/apps/workers/package.json ./apps/workers/package.json
WORKDIR /app/apps/workers
CMD ["node", "dist/apps/workers/src/main.js"]
