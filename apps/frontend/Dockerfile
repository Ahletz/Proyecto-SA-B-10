# Build stage
FROM node:22-alpine AS builder

WORKDIR /app
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install a lightweight web server
RUN npm install -g serve

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Copy package.json for reference
COPY package.json .

EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 CMD node -e "require('http').get('http://127.0.0.1:3000',r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["serve", "-s", "dist", "-l", "3000"]
