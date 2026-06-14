FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/types ./packages/types
COPY apps/api ./apps/api
RUN npm ci --workspace=@blamr/types --workspace=@blamr/api
RUN npm run build -w @blamr/types -w @blamr/api
RUN npm ci --omit=dev --workspace=@blamr/types --workspace=@blamr/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
