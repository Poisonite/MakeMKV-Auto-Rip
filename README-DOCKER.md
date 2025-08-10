# MakeMKV Auto Rip - Docker Setup Guide

Get MakeMKV Auto Rip running in Docker with just a few commands. Perfect for Linux servers, NAS systems, or anyone wanting a containerized solution with a web UI.

**Note:** This Docker implementation compiles MakeMKV from official source code following the [official Linux installation instructions](https://forum.makemkv.com/forum/viewtopic.php?f=3&t=224) to ensure compatibility and proper licensing.

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- DVD/Blu-ray drives connected to your system
- Basic familiarity with command line

### 1. Get the Code

```bash
git clone https://github.com/poisonite/MakeMKV-Auto-Rip.git
cd MakeMKV-Auto-Rip
```

### 2. Start the Web UI

```bash
# Create output directories (if they don't already exist, or if you need custom destination locations)
mkdir -p media logs

# Start the container
docker compose up -d

# Open the web UI
open http://localhost:3000  # macOS
xdg-open http://localhost:3000 || true  # Linux

# Watch logs (optional)
docker compose logs -f
```

That's it! Use the web UI to load/eject drives, start ripping, and edit configuration.

## 📁 File Organization

After running, you'll have:

```
MakeMKV-Auto-Rip/
├── media/          # Your ripped movies appear here
├── logs/           # Application logs
└── docker-compose.yaml
```

## ⚙️ Configuration

### Find Your Drives

First, identify your optical drives:

```bash
ls -la /dev/sr*
# Example output: /dev/sr0, /dev/sr1
```

### Multiple Drives

Edit `docker-compose.yaml` to add more drives:

```yaml
devices:
  - /dev/sr0:/dev/sr0:ro
  - /dev/sr1:/dev/sr1:ro
  - /dev/sr2:/dev/sr2:ro # Add more as needed
```

### Configuration

This project uses a single `config.yaml` at the repository root. The container ships with default settings, and you should bind-mount your copy to persist edits made from the web UI:

```yaml
services:
  makemkv-auto-rip:
    volumes:
      - ./media:/app/media
      - ./logs:/app/logs
      - ./config.yaml:/app/config.yaml # Persist and allow editing via web UI
```

Open the web UI and navigate to the Config page to edit settings. The edits are written back to your host `config.yaml`.

## 🔑 MakeMKV License & Settings

**Free Trial:** MakeMKV works for 30 days without a license.

**For Continued Use:** Purchase a license from [makemkv.com](https://makemkv.com/buy/). A monthly beta key is typically posted on the forum.

You can provide the key at runtime without editing files in the image. The entrypoint writes your values to `~/.MakeMKV/settings.conf` on startup.

### Option A: Use a `.env` file (recommended)

Create a `.env` next to `docker-compose.yaml`:

```env
MAKEMKV_APP_KEY=AAAA-BBBB-CCCC-DDDD-EEEE-FFFF
# Optional tunables (defaults shown)
MAKEMKV_MIN_TITLE_LENGTH=1000
MAKEMKV_IO_ERROR_RETRY_COUNT=10
```

Ensure your compose service has these environment entries (already included in this repo):

```yaml
services:
  makemkv-auto-rip:
    environment:
      - MAKEMKV_APP_KEY=${MAKEMKV_APP_KEY:-}
      - MAKEMKV_MIN_TITLE_LENGTH=${MAKEMKV_MIN_TITLE_LENGTH:-1000}
      - MAKEMKV_IO_ERROR_RETRY_COUNT=${MAKEMKV_IO_ERROR_RETRY_COUNT:-10}
```

### Option B: Use a key file

```bash
echo -n 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF' > makemkv_key.txt
```

```yaml
services:
  makemkv-auto-rip:
    environment:
      MAKEMKV_APP_KEY_FILE: /run/secrets/makemkv_key
    volumes:
      - ./makemkv_key.txt:/run/secrets/makemkv_key:ro
```

## 📊 Monitoring Your Rips

### Watch Progress

```bash
# Live logs
docker-compose logs -f

# Just the latest
docker logs makemkv-auto-rip --tail 50
```

### Check Status

```bash
# Is it running?
docker ps | grep makemkv

# How much space is it using?
du -sh media/

# Resource usage
docker stats makemkv-auto-rip
```

## 🔧 Common Issues

### "No drives detected"

```bash
# Check drives are accessible
ls -la /dev/sr*

# Make sure docker-compose.yaml includes your drives under services.makemkv-auto-rip.devices
# Restart if you added drives: docker compose restart
```

### "Permission denied" (drive load/eject)

```bash
# The container runs as a non-root user for safety and attempts to use the cdrom group.
# If load/eject fails, try one of the following:

# Option A: Run container as root (quickest workaround)
#   Add to docker-compose.yaml:
#   user: "0:0"

# Option B: Ensure the container user has access to the device file
#   Adjust host device permissions or match the 'cdrom' group GID on the host and container.
#   (This can vary by distro.)
```

### "Container keeps restarting"

```bash
# Check what's wrong
docker compose logs

# Common cause: missing drives in docker-compose.yml
```

## 🎯 Pro Tips

### Performance

- **Use SSD storage** for the `media` folder if possible

### Automation

```bash
# Auto-start on boot
docker-compose up -d --restart unless-stopped

# Auto-cleanup logs
docker system prune -f --volumes
```

## 🔄 Maintenance

### Updates

```bash
# Get latest version
git pull
docker compose build --no-cache
docker compose up -d
```

### Cleanup

```bash
# Remove old containers
docker system prune

# Check disk usage
docker system df
```

### Backup

```bash
# Save your setup
tar -czf makemkv-backup.tar.gz docker-compose.yaml config.yaml media/ logs/
```

## 🆘 Need Help?

1. **Check the logs first:** `docker compose logs -f`
2. **Verify your drives:** `ls -la /dev/sr*`
3. **Test MakeMKV directly:** `docker exec -it makemkv-auto-rip makemkvcon info`
4. **Still stuck?** Open an issue on GitHub with your logs

---

**Want technical details?** Check [PROJECT-INFO.md](PROJECT-INFO.md) for architecture information.
