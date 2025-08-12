/**
 * MakeMKV Auto Rip - WebSocket Middleware
 * Handles WebSocket connections for real-time status updates
 */

import { Logger } from "../../utils/logger.js";

// Store active WebSocket connections
const activeConnections = new Set();

/**
 * Handle new WebSocket connections
 * @param {WebSocket} ws - WebSocket connection
 * @param {Request} request - HTTP request object
 */
export function webSocketHandler(ws, request) {
  // Add to active connections
  activeConnections.add(ws);

  // Send welcome message
  ws.send(
    JSON.stringify({
      type: "connected",
      message: "Connected to MakeMKV Auto Rip Web UI",
      timestamp: new Date().toISOString(),
    })
  );

  // Handle incoming messages
  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data);
      handleWebSocketMessage(ws, message);
    } catch (error) {
      Logger.error("Invalid WebSocket message received", error.message);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid message format",
        })
      );
    }
  });

  // Handle connection close
  ws.on("close", () => {
    activeConnections.delete(ws);
    Logger.info("WebSocket connection closed");
  });

  // Handle connection errors
  ws.on("error", (error) => {
    Logger.error("WebSocket error", error.message);
    activeConnections.delete(ws);
  });
}

/**
 * Handle incoming WebSocket messages
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Parsed message object
 */
function handleWebSocketMessage(ws, message) {
  switch (message.type) {
    case "ping":
      ws.send(
        JSON.stringify({
          type: "pong",
          timestamp: new Date().toISOString(),
        })
      );
      break;

    case "subscribe":
      // Client wants to subscribe to status updates
      ws.send(
        JSON.stringify({
          type: "subscribed",
          message: "Subscribed to status updates",
        })
      );
      break;

    default:
      Logger.warning("Unknown WebSocket message type", message.type);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Unknown message type",
        })
      );
  }
}

/**
 * Broadcast a message to all connected clients
 * @param {Object} message - Message to broadcast
 */
export function broadcastToClients(message) {
  const messageString = JSON.stringify({
    ...message,
    timestamp: new Date().toISOString(),
  });

  activeConnections.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(messageString);
      } catch (error) {
        Logger.error("Failed to send WebSocket message", error.message);
        activeConnections.delete(ws);
      }
    } else {
      activeConnections.delete(ws);
    }
  });
}

/**
 * Send status update to all connected clients
 * @param {string} status - Current operation status
 * @param {string} operation - Current operation description
 * @param {Object} data - Additional data
 */
export function broadcastStatusUpdate(status, operation = null, data = {}) {
  broadcastToClients({
    type: "status_update",
    status,
    operation,
    data,
  });
}

/**
 * Send log message to all connected clients
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - Log message
 * @param {Object} data - Additional log data
 */
export function broadcastLogMessage(level, message, data = {}) {
  broadcastToClients({
    type: "log",
    level,
    message,
    data,
  });
}

/**
 * Get the number of active connections
 * @returns {number} Number of active WebSocket connections
 */
export function getActiveConnectionCount() {
  return activeConnections.size;
}
