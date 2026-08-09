import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/logger";

const SYNC_INTERVAL_MS = 1000;

interface TimeSyncMessage {
  type: "time_sync";
  serverTime: number;
}

export function setupWebSocket(wss: WebSocketServer) {
  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    const clientId = uuidv4();
    logger.websocketConnected(clientId);

    const sendTimeSync = () => {
      if (ws.readyState === WebSocket.OPEN) {
        const message: TimeSyncMessage = {
          type: "time_sync",
          serverTime: Date.now(),
        };
        ws.send(JSON.stringify(message));
      }
    };

    sendTimeSync();
    const syncInterval = setInterval(sendTimeSync, SYNC_INTERVAL_MS);

    ws.on("close", () => {
      clearInterval(syncInterval);
      logger.websocketDisconnected(clientId);
    });

    ws.on("error", () => {
      clearInterval(syncInterval);
      logger.websocketDisconnected(clientId);
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", serverTime: Date.now() }));
        }
      } catch {
        // ignore malformed messages
      }
    });
  });
}
