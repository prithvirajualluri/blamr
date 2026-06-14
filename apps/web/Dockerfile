FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/types ./packages/types
COPY apps/web ./apps/web
RUN npm ci --workspace=@blamr/types --workspace=@blamr/web
RUN npm run build -w @blamr/types
ARG VITE_API_BASE_URL=http://localhost:3000
ARG VITE_INGEST_URL=http://localhost:3001
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_INGEST_URL=$VITE_INGEST_URL
RUN npm run build -w @blamr/web

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
