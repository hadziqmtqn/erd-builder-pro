# Build Stage
FROM node:22-alpine AS build

# Build args for Vite env vars (required)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL=""
ARG VITE_ENABLE_GUEST_MODE="true"

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all source files
COPY . .

# Build the frontend (Vite)
RUN npm run build

# Production Stage
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies and tsx (required for running server)
RUN npm install --omit=dev && npm install tsx

# Copy dist from build stage (Vite output)
COPY --from=build /app/dist ./dist

# Copy server files
COPY --from=build /app/server ./server
# Copy shared types (used by server indirectly via type resolution)
COPY --from=build /app/shared ./shared
COPY --from=build /app/tsconfig.json ./

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check for Coolify / orchestrators
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application using tsx as defined in package.json "start" script
CMD ["npm", "start"]
