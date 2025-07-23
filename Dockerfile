# MakeMKV Auto Rip Docker Image
FROM node:22-bookworm

# Install MakeMKV build dependencies and runtime requirements
RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    libc6-dev \
    libssl-dev \
    libexpat1-dev \
    libavcodec-dev \
    libgl1-mesa-dev \
    qtbase5-dev \
    zlib1g-dev \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set MakeMKV version - update this when new versions are released
ARG MAKEMKV_VERSION=1.17.5

# Download and compile MakeMKV from official sources
RUN cd /tmp && \
    # Download both OSS and binary packages
    wget "https://www.makemkv.com/download/makemkv-bin-${MAKEMKV_VERSION}.tar.gz" && \
    wget "https://www.makemkv.com/download/makemkv-oss-${MAKEMKV_VERSION}.tar.gz" && \
    # Extract OSS package and compile
    tar -xzf "makemkv-oss-${MAKEMKV_VERSION}.tar.gz" && \
    cd "makemkv-oss-${MAKEMKV_VERSION}" && \
    ./configure && \
    make && \
    make install && \
    cd /tmp && \
    # Extract binary package and compile
    tar -xzf "makemkv-bin-${MAKEMKV_VERSION}.tar.gz" && \
    cd "makemkv-bin-${MAKEMKV_VERSION}" && \
    # Accept license automatically for Docker build
    echo "yes" | make && \
    make install && \
    # Cleanup
    cd / && rm -rf /tmp/makemkv-*

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

# Create directories and non-root user for security
RUN mkdir -p /app/media /app/logs /home/makemkv/.MakeMKV && \
    addgroup --gid 1001 makemkv && \
    adduser --system --uid 1001 --gid 1001 makemkv && \
    chown -R makemkv:makemkv /app /home/makemkv

# Configure MakeMKV settings
RUN echo 'app_Key = ""' > /home/makemkv/.MakeMKV/settings.conf && \
    echo '# Add your MakeMKV registration key above if you have one' >> /home/makemkv/.MakeMKV/settings.conf && \
    echo '# For evaluation purposes, MakeMKV will work for 30 days without a key' >> /home/makemkv/.MakeMKV/settings.conf && \
    chown -R makemkv:makemkv /home/makemkv/.MakeMKV

# Switch to non-root user
USER makemkv

# Set environment variables for Docker
ENV NODE_ENV=production
ENV DOCKER_CONTAINER=true

# Expose volumes for media and logs
VOLUME ["/app/media", "/app/logs"]

# Health check - verify MakeMKV is properly installed
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD makemkvcon --version > /dev/null 2>&1 || exit 1

# Default command
CMD ["npm", "start"]