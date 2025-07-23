# MakeMKV Auto Rip - Docker Guide

This guide covers how to use MakeMKV Auto Rip with Docker for cross-platform deployment.

## 🐳 Quick Start with Docker

### Prerequisites

- Docker and Docker Compose installed
- Optical drives accessible to the host system
- MakeMKV registration key (for commercial use)

### Using Docker Compose (Recommended)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/poisonite/MakeMKV-Auto-Rip.git
   cd MakeMKV-Auto-Rip
   ```

2. **Start the container:**
   ```bash
   npm run docker:run
   # or directly: docker-compose up -d
   ```

3. **View logs:**
   ```bash
   npm run docker:logs
   # or directly: docker-compose logs -f
   ```

4. **Stop the container:**
   ```bash
   npm run docker:stop
   # or directly: docker-compose down
   ```

### Manual Docker Commands

1. **Build the image:**
   ```bash
   npm run docker:build
   # or directly: docker build -t makemkv-auto-rip .
   ```

2. **Run the container:**
   ```bash
   docker run -it --rm \
     --privileged \
     --device=/dev/sr0:/dev/sr0:ro \
     --device=/dev/sr1:/dev/sr1:ro \
     -v ./media:/app/media \
     -v ./logs:/app/logs \
     -v ./config/default.json:/app/config/default.json:ro \
     makemkv-auto-rip
   ```

## 📁 Volume Configuration

### Required Volumes

| Volume | Purpose | Example |
|--------|---------|---------|
| `/app/media` | Output directory for ripped files | `-v ./media:/app/media` |
| `/app/logs` | Log file storage | `-v ./logs:/app/logs` |

### Optional Volumes

| Volume | Purpose | Example |
|--------|---------|---------|
| `/app/config/default.json` | Custom configuration | `-v ./config/default.json:/app/config/default.json:ro` |

### Device Access

Optical drives must be mounted as devices:

```bash
# For first optical drive
--device=/dev/sr0:/dev/sr0:ro

# For second optical drive  
--device=/dev/sr1:/dev/sr1:ro

# For DVD/CD drives (alternative naming)
--device=/dev/dvd:/dev/dvd:ro
--device=/dev/cdrom:/dev/cdrom:ro
```

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKER_CONTAINER` | `true` | Automatically set in container |
| `NODE_ENV` | `production` | Runtime environment |

### Docker-Specific Behavior

When running in Docker, the application automatically:

- **Disables drive loading/ejecting** (Windows-only features)
- **Uses system MakeMKV executable** (instead of Windows path)
- **Adapts file paths** for Linux filesystem
- **Logs informative messages** about disabled features

### Custom Configuration

Create a custom `config/default.json`:

```json
{
    "Path": {
        "mkvDir": {
            "Dir": "/usr/bin"
        },
        "movieRips": {
            "Dir": "/app/media"
        },
        "logging": {
            "toFiles": "true",
            "Dir": "/app/logs",
            "timeFormat": "24hr"
        },
        "loadDrives": {
            "Enabled": "false"
        },
        "ejectDrives": {
            "Enabled": "false"
        },
        "ripAll": {
            "Enabled": "false"
        },
        "rippingMode": {
            "Mode": "async"
        }
    }
}
```

## 🔍 Troubleshooting

### Common Issues

#### Drive Not Detected

```bash
# Check if drives are visible to the host
lsblk
ls -la /dev/sr*

# Verify container has access
docker exec -it makemkv-auto-rip ls -la /dev/sr*
```

#### Permission Denied

```bash
# Add your user to the cdrom group
sudo usermod -a -G cdrom $USER

# Or run with --privileged flag
docker run --privileged ...
```

#### MakeMKV Not Found

```bash
# Check if MakeMKV is installed in container
docker exec -it makemkv-auto-rip which makemkvcon

# Verify MakeMKV installation
docker exec -it makemkv-auto-rip makemkvcon --version
```

### Debug Mode

Run with interactive terminal for debugging:

```bash
docker run -it --rm \
  --privileged \
  --device=/dev/sr0:/dev/sr0:ro \
  -v ./media:/app/media \
  -v ./logs:/app/logs \
  makemkv-auto-rip bash
```

### Log Analysis

```bash
# View container logs
docker-compose logs -f makemkv-auto-rip

# Check application logs
tail -f ./logs/*.log

# View system logs
journalctl -u docker
```

## 🏗️ Advanced Usage

### Custom Dockerfile

Extend the base image for custom requirements:

```dockerfile
FROM makemkv-auto-rip:latest

# Install additional tools
RUN apk add --no-cache \
    mediainfo \
    ffmpeg

# Add custom scripts
COPY custom-scripts/ /app/scripts/

# Override entrypoint
ENTRYPOINT ["/app/scripts/custom-entrypoint.sh"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: makemkv-auto-rip
spec:
  replicas: 1
  selector:
    matchLabels:
      app: makemkv-auto-rip
  template:
    metadata:
      labels:
        app: makemkv-auto-rip
    spec:
      containers:
      - name: makemkv-auto-rip
        image: makemkv-auto-rip:latest
        securityContext:
          privileged: true
        volumeMounts:
        - name: media-storage
          mountPath: /app/media
        - name: logs-storage
          mountPath: /app/logs
        - name: optical-drive
          mountPath: /dev/sr0
      volumes:
      - name: media-storage
        persistentVolumeClaim:
          claimName: media-pvc
      - name: logs-storage
        persistentVolumeClaim:
          claimName: logs-pvc
      - name: optical-drive
        hostPath:
          path: /dev/sr0
```

### Docker Swarm

```yaml
version: '3.8'

services:
  makemkv-auto-rip:
    image: makemkv-auto-rip:latest
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.labels.optical-drives == true
    volumes:
      - media:/app/media
      - logs:/app/logs
    devices:
      - /dev/sr0:/dev/sr0:ro
    privileged: true

volumes:
  media:
    driver: local
  logs:
    driver: local
```

## 🔒 Security Considerations

### Privileged Mode

The container runs in privileged mode for hardware access:

- **Required for**: Optical drive access
- **Risk**: Full system access
- **Mitigation**: Use specific device mounts when possible

### User Permissions

```dockerfile
# Container runs as non-root user
USER makemkv (uid: 1001)

# File permissions
RUN chown -R makemkv:makemkv /app
```

### Volume Security

```bash
# Restrict volume permissions
chmod 755 ./media ./logs
chown 1001:1001 ./media ./logs
```

## 📊 Performance Optimization

### Resource Limits

```yaml
services:
  makemkv-auto-rip:
    image: makemkv-auto-rip:latest
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Storage Optimization

```bash
# Use SSD for media output (faster parallel ripping)
docker run -v /fast-ssd/media:/app/media ...

# Use HDD for logs (lower priority)
docker run -v /slow-hdd/logs:/app/logs ...
```

## 🆘 Support

If you encounter issues with Docker deployment:

1. Check the [main README](README.md) for general troubleshooting
2. Review Docker logs: `docker-compose logs -f`
3. Verify system requirements and permissions
4. Open an issue on GitHub with:
   - Docker version (`docker --version`)
   - System information (`uname -a`)
   - Container logs
   - Steps to reproduce the issue