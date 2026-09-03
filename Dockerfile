# Build Stage
FROM node:26-alpine AS build

# Build args for Vite env vars (required)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL=""
ARG VITE_ENABLE_GUEST_MODE="false"

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (skip postinstall — prisma generate needs prisma.config.ts, not yet copied)
RUN npm install --ignore-scripts

# Copy Prisma files (needed for client generation)
COPY prisma.config.ts ./
COPY prisma/ ./prisma/

# Generate Prisma client (Supabase variant — default)
RUN npx prisma generate

# Copy all remaining source files
COPY . .

# Build the frontend (Vite)
RUN npm run build

# Production Stage
FROM node:26-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies (skip postinstall — prisma CLI is a devDep)
# prisma CLI is needed at runtime for client regeneration + db push
# better-sqlite3: native addon required by @prisma/adapter-better-sqlite3 for SQLite mode
# --ignore-scripts prevents native compilation; we rebuild explicitly below
# --fetch-timeout=300000 handles slow/distanced npm registries
RUN npm install --omit=dev --ignore-scripts --fetch-timeout=300000 && npm install tsx prisma better-sqlite3 --fetch-timeout=300000

# Install build tools for better-sqlite3 native compilation + psql for PostgreSQL probing
RUN apk add --no-cache postgresql-client python3 make g++

# Rebuild better-sqlite3 native addon against this container's Node.js ABI
# npm_config_build_from_source=true ensures compilation even without prebuild binaries
RUN npm_config_build_from_source=true npm rebuild better-sqlite3 || echo "WARNING: better-sqlite3 rebuild failed (SQLite mode will not work)"

# Copy pre-generated Prisma client from build stage (fallback for Supabase)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./

# Copy dist from build stage (Vite output)
COPY --from=build /app/dist ./dist

# Copy server files
COPY --from=build /app/server ./server
# Copy shared types (used by server indirectly via type resolution)
COPY --from=build /app/shared ./shared
COPY --from=build /app/tsconfig.json ./

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Health check for Coolify / orchestrators
# Server starts in background early (~5s), so start-period can be short
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Entrypoint detects database mode and runs migration before starting
ENTRYPOINT ["docker-entrypoint.sh"]

# Start the application using tsx as defined in package.json "start" script
CMD ["npm", "start"]
