/**
 * MakeMKV Auto Rip - Web UI JavaScript
 * Handles the frontend functionality and WebSocket communication
 */

class MakeMKVWebUI {
  constructor() {
    this.ws = null;
    this.reconnectInterval = null;
    this.isConnected = false;
    this.currentStatus = "idle";
    this.currentOperation = null;

    this.init();
  }

  /**
   * Initialize the web UI
   */
  init() {
    this.setupWebSocket();
    this.setupEventListeners();
    this.updateConnectionStatus("connecting");
    this.addLog("info", "Initializing Web UI...");
  }

  /**
   * Setup WebSocket connection
   */
  setupWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.updateConnectionStatus("connected");
        this.addLog("success", "Connected to server");

        // Subscribe to status updates
        this.sendWebSocketMessage({ type: "subscribe" });

        // Start status polling
        this.startStatusPolling();

        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.updateConnectionStatus("disconnected");
        this.addLog("warn", "Connection lost. Attempting to reconnect...");
        this.startReconnecting();
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.addLog("error", "Connection error occurred");
      };
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
      this.updateConnectionStatus("disconnected");
      this.startReconnecting();
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleWebSocketMessage(data) {
    switch (data.type) {
      case "connected":
        this.addLog("info", data.message);
        break;

      case "status_update":
        this.updateStatus(data.status, data.operation, data.canStop);
        break;

      case "log":
        this.addLog(data.level, data.message);
        break;

      case "subscribed":
        this.addLog("info", "Subscribed to status updates");
        break;

      default:
        console.log("Unknown message type:", data.type);
    }
  }

  /**
   * Send message through WebSocket
   */
  sendWebSocketMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start reconnecting to WebSocket
   */
  startReconnecting() {
    if (this.reconnectInterval) {
      return;
    }

    this.reconnectInterval = setInterval(() => {
      if (!this.isConnected) {
        this.addLog("info", "Attempting to reconnect...");
        this.setupWebSocket();
      }
    }, 5000);
  }

  /**
   * Update connection status in UI
   */
  updateConnectionStatus(status) {
    const indicator = document.getElementById("statusIndicator");
    const text = document.getElementById("statusText");

    indicator.className = `status-indicator ${status}`;

    switch (status) {
      case "connected":
        text.textContent = "Connected";
        break;
      case "connecting":
        text.textContent = "Connecting...";
        break;
      case "disconnected":
        text.textContent = "Disconnected";
        break;
    }
  }

  /**
   * Setup event listeners for UI elements
   */
  setupEventListeners() {
    // Drive operation buttons
    document.getElementById("loadDrivesBtn").addEventListener("click", () => {
      this.performDriveOperation("load");
    });

    document.getElementById("ejectDrivesBtn").addEventListener("click", () => {
      this.performDriveOperation("eject");
    });

    // Ripping operations
    document.getElementById("startRippingBtn").addEventListener("click", () => {
      this.startRipping();
    });

    // Logs
    document.getElementById("clearLogsBtn").addEventListener("click", () => {
      this.clearLogs();
    });
  }

  /**
   * Start status polling
   */
  startStatusPolling() {
    // Poll status every 2 seconds
    setInterval(() => {
      if (this.isConnected) {
        this.fetchStatus();
      }
    }, 2000);

    // Initial status fetch
    this.fetchStatus();
  }

  /**
   * Fetch current status from API
   */
  async fetchStatus() {
    try {
      const response = await fetch("/api/status");
      const data = await response.json();
      this.updateStatus(data.status, data.operation, data.canStop);
    } catch (error) {
      console.error("Failed to fetch status:", error);
    }
  }

  /**
   * Update status display
   */
  updateStatus(status, operation, canStop = false) {
    this.currentStatus = status;
    this.currentOperation = operation;
    this.canStop = canStop;

    const statusElement = document.getElementById("currentStatus");
    const operationElement = document.getElementById("currentOperation");

    statusElement.textContent =
      status.charAt(0).toUpperCase() + status.slice(1);
    statusElement.className = `status-value ${status}`;

    operationElement.textContent = operation || "None";

    // Update button states
    this.updateButtonStates(status, canStop);
  }

  /**
   * Update button states based on current status
   */
  updateButtonStates(status, canStop = false) {
    const isOperationInProgress = status !== "idle";

    // Get button elements
    const loadBtn = document.getElementById("loadDrivesBtn");
    const ejectBtn = document.getElementById("ejectDrivesBtn");
    const ripBtn = document.getElementById("startRippingBtn");

    if (isOperationInProgress && canStop) {
      // Show stop buttons when operations are running
      if (status === "loading") {
        loadBtn.innerHTML = "⏹️ Stop Loading";
        loadBtn.className = "btn btn-warning";
        loadBtn.disabled = false;
        ejectBtn.disabled = true;
        ripBtn.disabled = true;
      } else if (status === "ejecting") {
        ejectBtn.innerHTML = "⏹️ Stop Ejecting";
        ejectBtn.className = "btn btn-warning";
        ejectBtn.disabled = false;
        loadBtn.disabled = true;
        ripBtn.disabled = true;
      } else if (status === "ripping") {
        ripBtn.innerHTML = "⏹️ Stop Ripping";
        ripBtn.className = "btn btn-warning";
        ripBtn.disabled = false;
        loadBtn.disabled = true;
        ejectBtn.disabled = true;
      }
    } else {
      // Show normal buttons when idle
      loadBtn.innerHTML = "📥 Load All Drives";
      loadBtn.className = "btn btn-primary";
      loadBtn.disabled = isOperationInProgress;

      ejectBtn.innerHTML = "📤 Eject All Drives";
      ejectBtn.className = "btn btn-secondary";
      ejectBtn.disabled = isOperationInProgress;

      ripBtn.innerHTML = "▶️ Start Ripping";
      ripBtn.className = "btn btn-success";
      ripBtn.disabled = isOperationInProgress;
    }
  }

  /**
   * Perform drive operation (load/eject) or stop current operation
   */
  async performDriveOperation(operation) {
    try {
      // Check if this is a stop operation
      if (this.canStop && this.currentStatus !== "idle") {
        await this.stopCurrentOperation();
        return;
      }

      this.addLog(
        "info",
        `${operation === "load" ? "Loading" : "Ejecting"} drives...`
      );

      const response = await fetch(`/api/drives/${operation}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.success) {
        this.addLog("success", data.message);
      } else {
        this.addLog("error", data.error || "Operation failed");
      }
    } catch (error) {
      this.addLog("error", `Failed to ${operation} drives: ${error.message}`);
    }
  }

  /**
   * Start the ripping process or stop current operation
   */
  async startRipping() {
    try {
      // Check if this is a stop operation
      if (this.canStop && this.currentStatus === "ripping") {
        await this.stopCurrentOperation();
        return;
      }

      this.addLog("info", "Starting ripping process...");

      const response = await fetch("/api/rip/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.success) {
        this.addLog("success", data.message);
      } else {
        this.addLog("error", data.error || "Failed to start ripping");
      }
    } catch (error) {
      this.addLog("error", `Failed to start ripping: ${error.message}`);
    }
  }

  /**
   * Stop the current operation
   */
  async stopCurrentOperation() {
    try {
      this.addLog("warn", "Stopping current operation...");

      const response = await fetch("/api/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.success) {
        this.addLog("warn", data.message);
      } else {
        this.addLog("error", data.error || "Failed to stop operation");
      }
    } catch (error) {
      this.addLog("error", `Failed to stop operation: ${error.message}`);
    }
  }

  /**
   * Add log entry to the UI
   */
  addLog(level, message) {
    const logsContent = document.getElementById("logsContent");
    const logEntry = document.createElement("div");
    logEntry.className = `log-entry ${level}`;

    const timestamp = new Date().toLocaleTimeString();
    logEntry.innerHTML = `
      <span class="log-time">${timestamp}</span>
      <span class="log-message">${message}</span>
    `;

    logsContent.appendChild(logEntry);

    // Auto-scroll to bottom
    const logsContainer = logsContent.parentElement;
    logsContainer.scrollTop = logsContainer.scrollHeight;

    // Keep only last 100 log entries
    const entries = logsContent.children;
    if (entries.length > 100) {
      logsContent.removeChild(entries[0]);
    }
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    const logsContent = document.getElementById("logsContent");
    logsContent.innerHTML = "";
    this.addLog("info", "Logs cleared");
  }
}

// Initialize the web UI when the page loads
document.addEventListener("DOMContentLoaded", () => {
  new MakeMKVWebUI();
});
