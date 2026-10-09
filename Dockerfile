# Stage 1: Build & Compilation
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy configuration and source files
COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY tests ./tests

# Run tests & build dist output
RUN npm test
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy dependency files and install production-only dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy compiled artifacts from builder
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Expose port (if web interface is added)
EXPOSE 3000

# Default entrypoint runs the enterprise analytical demo
CMD ["node", "dist/demo.js"]
