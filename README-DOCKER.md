# MakeMKV Auto Rip - Docker Setup Guide

Get MakeMKV Auto Rip running in Docker with just a few commands. Perfect for Linux servers, NAS systems, or anyone wanting a containerized solution.

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

### 2. Start Ripping
```bash
# Create output directories
mkdir -p media logs

# Start the container
docker-compose up -d

# Watch it work
docker-compose logs -f
```

That's it! Insert a disc and the container will automatically detect and start ripping.

## 📁 File Organization

After running, you'll have:
```
MakeMKV-Auto-Rip/
├── media/          # Your ripped movies appear here
├── logs/           # Application logs
└── docker-compose.yml
```

## ⚙️ Configuration

### Find Your Drives
First, identify your optical drives:
```bash
ls -la /dev/sr*
# Example output: /dev/sr0, /dev/sr1
```

### Multiple Drives
Edit `docker-compose.yml` to add more drives:
```yaml
devices:
  - /dev/sr0:/dev/sr0:ro
  - /dev/sr1:/dev/sr1:ro
  - /dev/sr2:/dev/sr2:ro  # Add more as needed
```

### Custom Settings
Want to change ripping behavior? Copy and modify the config:
```bash
cp config/default.json my-config.json
# Edit my-config.json with your preferences
# Mount it: -v $(pwd)/my-config.json:/app/config/default.json:ro
```

## 🔑 MakeMKV License

**Free Trial:** Works for 30 days without a license (standard MakeMKV evaluation period).

**For Continued Use:**
1. Buy a license from [makemkv.com](https://makemkv.com/buy/)
2. Add it to your setup:

```bash
# Method 1: Environment variable
echo "MAKEMKV_KEY=your-license-key" >> .env

# Method 2: Settings file
echo 'app_Key = "your-license-key"' > makemkv-settings.conf
# Then mount it in docker-compose.yml
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

# Make sure docker-compose.yml includes your drives
# Restart if you added drives: docker-compose restart
```

### "Permission denied"
```bash
# Fix directory permissions
sudo chown -R $USER:$USER media logs
chmod 755 media logs
```

### "Container keeps restarting"
```bash
# Check what's wrong
docker-compose logs

# Common cause: missing drives in docker-compose.yml
```

## 🎯 Pro Tips

### Performance
- **Use SSD storage** for the `media` folder if possible
- **Don't run on the same drive** as your OS if you can avoid it
- **One disc at a time** usually works best

### Organization
```bash
# Organize by date
mkdir -p media/$(date +%Y-%m-%d)

# Or by disc type
mkdir -p media/{movies,tv-shows,documentaries}
```

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
docker-compose build --no-cache
docker-compose up -d
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
tar -czf makemkv-backup.tar.gz docker-compose.yml config/ media/
```

## 🆘 Need Help?

1. **Check the logs first:** `docker-compose logs -f`
2. **Verify your drives:** `ls -la /dev/sr*`
3. **Test MakeMKV directly:** `docker exec -it makemkv-auto-rip makemkvcon info`
4. **Still stuck?** Open an issue on GitHub with your logs

---

**Want technical details?** Check [PROJECT-INFO.md](PROJECT-INFO.md) for architecture information.