# MakeMKV Auto Rip - Web UI

This directory contains the web interface components for MakeMKV Auto Rip.

## Architecture

### Directory Structure

```
src/web/
├── web.service.js          # Main web service class
├── routes/
│   └── api.routes.js       # API endpoint definitions
├── middleware/
│   └── websocket.middleware.js  # WebSocket handling
└── static/
    ├── css/
    │   └── styles.css      # Web UI styling
    └── js/
        └── app.js          # Frontend JavaScript logic
```

### Components

- **WebService** - Manages Express server and WebSocket connections
- **API Routes** - Handles REST API endpoints for drive operations, config management, and ripping
- **WebSocket Middleware** - Provides real-time status updates to the frontend
- **Frontend** - Vanilla JavaScript web interface with no framework dependencies

## Usage

Start the web interface:

```bash
npm run web
```

The web UI will be available at: http://localhost:3000

## Features

- **Drive Operations** - Load and eject optical drives
- **Configuration Management** - Edit config.yaml through the web interface
- **Ripping Control** - Start the main ripping process
- **Real-time Status** - Live updates via WebSocket
- **Activity Logs** - View operation logs in real-time
