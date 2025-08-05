/**
 * MakeMKV Auto Rip - Web Service
 * Manages the web server and WebSocket connections for the web UI
 */

import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Logger } from "../utils/logger.js";
import { apiRoutes } from "./routes/api.routes.js";
import { webSocketHandler } from "./middleware/websocket.middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Web Service class for managing the web interface
 */
export class WebService {
  constructor() {
    this.app = express();
    this.server = null;
    this.wss = null;
    this.port = process.env.PORT || 3000;
    this.isRunning = false;
  }

  /**
   * Initialize and start the web service
   */
  async start() {
    try {
      await this.setupServer();
      await this.setupWebSocket();
      await this.listen();

      this.isRunning = true;
      Logger.info(
        `Web UI started successfully at http://localhost:${this.port}`
      );
    } catch (error) {
      Logger.error("Failed to start web service", error.message);
      throw error;
    }
  }

  /**
   * Setup Express server and middleware
   */
  async setupServer() {
    // Create HTTP server
    this.server = createServer(this.app);

    // Middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Serve static files
    this.app.use("/static", express.static(path.join(__dirname, "static")));
    this.app.use(express.static(path.join(process.cwd(), "public")));

    // API routes
    this.app.use("/api", apiRoutes);

    // Serve main page
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(process.cwd(), "public", "index.html"));
    });

    // Serve configuration page
    this.app.get("/config.html", (req, res) => {
      res.sendFile(path.join(process.cwd(), "public", "config.html"));
    });

    // Serve configuration page with clean URL
    this.app.get("/config", (req, res) => {
      res.sendFile(path.join(process.cwd(), "public", "config.html"));
    });

    Logger.info("Express server configured");
  }

  /**
   * Setup WebSocket server for real-time updates
   */
  async setupWebSocket() {
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on("connection", (ws, request) => {
      Logger.info("New WebSocket connection established");
      webSocketHandler(ws, request);
    });

    Logger.info("WebSocket server configured");
  }

  /**
   * Start listening on the configured port
   */
  async listen() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Stop the web service
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false;
        Logger.info("Web service stopped");
        resolve();
      });
    });
  }

  /**
   * Get the current status of the web service
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.port,
      connections: this.wss ? this.wss.clients.size : 0,
    };
  }
}
