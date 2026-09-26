# Build stage
FROM node:22-alpine AS builder

WORKDIR /app
# Dev (kind/compose): URL del Gateway. Producción: vacío, /api va al mismo origen y
# nginx lo reenvía al Gateway (API_UPSTREAM, ver nginx/40-api-proxy.sh).
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage: nginx sirve la SPA en el puerto 3000
FROM nginx:1.29-alpine

COPY nginx/40-api-proxy.sh /docker-entrypoint.d/40-api-proxy.sh
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
