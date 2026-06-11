FROM node:20-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files first (layer caching)
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of the source
COPY . .

# Expose app port
EXPOSE 3000

# Entrypoint: wait for DB, run migrations + seed, then start app
CMD ["sh", "-c", "\
  echo 'Waiting for PostgreSQL...' && \
  until npx prisma db push --accept-data-loss 2>/dev/null; do \
    echo 'DB not ready yet, retrying in 3s...' && sleep 3; \
  done && \
  echo 'Running seed...' && \
  node prisma/seed.js && \
  echo 'Starting app...' && \
  node src/app.js \
"]
