/**
 * WebSocket service for the Profession Chat app.
 * Manages a single persistent connection per chat session.
 */

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/chat";
const MESSAGE_TIMEOUT = 30_000;
const CONNECTION_TIMEOUT = 10_000;
const MAX_RECONNECT_ATTEMPTS = 5;

type MessageCallback = (data: unknown) => void;

interface PendingMessage {
  data: unknown;
  resolve: (value: string) => void;
  reject: (reason?: unknown) => void;
}

class ProfChatSocketService {
  private ws: WebSocket | null = null;
  private connecting = false;
  private connectionPromise: Promise<WebSocket> | null = null;
  private listeners: Map<string, MessageCallback> = new Map();
  private messageQueue: PendingMessage[] = [];
  private activeHandler: { resolve: (v: string) => void; reject: (r?: unknown) => void; timeout: ReturnType<typeof setTimeout> } | null = null;
  private reconnectAttempts = 0;
  private reconnectDelay = 1000;
  private shuttingDown = false;

  private createConnection(): Promise<WebSocket> {
    if (this.connecting && this.connectionPromise) return this.connectionPromise;
    this.connecting = true;

    this.connectionPromise = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      const connTimeout = setTimeout(() => {
        this.connecting = false;
        ws.close();
        reject(new Error("WebSocket connection timeout"));
      }, CONNECTION_TIMEOUT);

      ws.onopen = () => {
        clearTimeout(connTimeout);
        this.ws = ws;
        this.connecting = false;
        this.connectionPromise = null;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.drainQueue();
        resolve(ws);
      };

      ws.onmessage = (event) => {
        this.handleIncoming(event.data as string);
      };

      ws.onclose = (event) => {
        console.log("[WS] Connection closed", event.code, event.reason);
        this.ws = null;
        this.connectionPromise = null;
        this.connecting = false;
        if (this.activeHandler) {
          clearTimeout(this.activeHandler.timeout);
          this.activeHandler.reject(new Error("WebSocket connection closed"));
          this.activeHandler = null;
        }
        if (!this.shuttingDown && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          setTimeout(() => {
            if (!this.shuttingDown) {
              this.reconnectAttempts++;
              this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
              this.connectionPromise = this.createConnection();
            }
          }, this.reconnectDelay);
        }
      };

      ws.onerror = () => {
        clearTimeout(connTimeout);
        this.connecting = false;
        reject(new Error("WebSocket connection error"));
      };
    });

    return this.connectionPromise;
  }

  private getConnection(): Promise<WebSocket> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve(this.ws);
    if (this.connectionPromise) return this.connectionPromise;
    this.connectionPromise = this.createConnection();
    return this.connectionPromise;
  }

  private handleIncoming(raw: string) {
    // Notify all named listeners
    this.listeners.forEach((cb) => {
      try {
        cb(JSON.parse(raw));
      } catch {
        cb(raw);
      }
    });

    // Handle active message handler
    if (this.activeHandler) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.type === "complete_response") {
          clearTimeout(this.activeHandler.timeout);
          const handler = this.activeHandler;
          this.activeHandler = null;
          handler.resolve(parsed.total_content || "");
          this.drainQueue();
        }
      } catch {
        // Non-JSON — ignore for active handler
      }
    }
  }

  private drainQueue() {
    if (this.messageQueue.length > 0 && !this.activeHandler) {
      const next = this.messageQueue.shift()!;
      this.sendInternal(next.data, next.resolve, next.reject);
    }
  }

  private sendInternal(data: unknown, resolve: (v: string) => void, reject: (r?: unknown) => void) {
    this.activeHandler = {
      resolve,
      reject,
      timeout: setTimeout(() => {
        this.activeHandler = null;
        reject(new Error("Message timeout"));
        this.drainQueue();
      }, MESSAGE_TIMEOUT),
    };
    try {
      this.ws!.send(JSON.stringify(data));
    } catch (e) {
      clearTimeout(this.activeHandler.timeout);
      this.activeHandler = null;
      reject(e);
    }
  }

  async send(data: unknown): Promise<string> {
    await this.getConnection();
    return new Promise<string>((resolve, reject) => {
      if (this.activeHandler) {
        this.messageQueue.push({ data, resolve, reject });
        return;
      }
      this.sendInternal(data, resolve, reject);
    });
  }

  /** Add a named listener for all incoming messages (outside the request-response flow). */
  addListener(id: string, cb: MessageCallback) {
    this.listeners.set(id, cb);
  }

  removeListener(id: string) {
    this.listeners.delete(id);
  }

  /** Send a message and ignore the response (fire-and-forget). */
  async fireAndForget(data: unknown) {
    const ws = await this.getConnection();
    ws.send(JSON.stringify(data));
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close() {
    this.shuttingDown = true;
    if (this.activeHandler) {
      clearTimeout(this.activeHandler.timeout);
      this.activeHandler = null;
    }
    this.messageQueue = [];
    this.ws?.close();
    this.ws = null;
    this.connectionPromise = null;
  }

  reset() {
    this.close();
    this.shuttingDown = false;
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
  }
}

export const socketService = new ProfChatSocketService();
