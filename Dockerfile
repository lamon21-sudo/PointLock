FROM node:18-alpine

# Install system dependencies (OpenSSL for Prisma)
RUN apk add --no-cache openssl openssl-dev libc6-compat

# Install pnpm
RUN npm install -g pnpm@9.1.0

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN pnpm install

# Copy source code
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api

# Build shared-types first
RUN pnpm --filter @pick-rivals/shared-types build

# Generate Prisma client and build API
RUN cd apps/api && npx prisma generate && pnpm build

# Expose port
EXPOSE 3000

# Start the API
CMD ["node", "apps/api/dist/index.js"]
