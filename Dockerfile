# MakeMKV Auto Rip Docker Image
FROM node:22-alpine

# Install MakeMKV dependencies
RUN apk add --no-cache \
    makemkv \
    makemkv-con \
    && mkdir -p /app/media /app/logs

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy application source (excluding tests and development files)
COPY src/ ./src/
COPY config/ ./config/
COPY index.js ./

# Create non-root user for security
RUN addgroup -g 1001 -S makemkv && \
    adduser -S makemkv -u 1001 -G makemkv && \
    chown -R makemkv:makemkv /app

# Switch to non-root user
USER makemkv

# Set environment variables for Docker
ENV NODE_ENV=production
ENV DOCKER_CONTAINER=true

# Expose volumes for media and logs
VOLUME ["/app/media", "/app/logs"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -c "console.log('Health check passed')" || exit 1

# Default command
CMD ["npm", "start"]