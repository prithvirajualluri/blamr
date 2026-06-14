FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/types ./packages/types
COPY apps/ingest ./apps/ingest
RUN npm ci --workspace=@blamr/types --workspace=@blamr/ingest
RUN npm run build -w @blamr/types -w @blamr/ingest
RUN npm ci --omit=dev --workspace=@blamr/types --workspace=@blamr/ingest

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder /app/apps/ingest/dist ./apps/ingest/dist
COPY --from=builder /app/apps/ingest/package.json ./apps/ingest/package.json
WORKDIR /app/apps/ingest
EXPOSE 3001
CMD ["node", "dist/main.js"]
