import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/logger";
import {
  registerClient,
  unregisterClient,
  subscribeClientToRally,
} from "./rally-hub";

const SYNC_INTERVAL_MS = 1000;

export function setupWebSocket(wss: WebSocketServer) {
  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    const clientId = uuidv4();
    registerClient(ws);
    logger.websocketConnected(clientId);

    const sendTimeSync = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "time_sync",
            serverTime: Date.now(),
          })
        );
      }
    };

    sendTimeSync();
    const syncInterval = setInterval(sendTimeSync, SYNC_INTERVAL_MS);

    ws.on("close", () => {
      clearInterval(syncInterval);
      unregisterClient(ws);
      logger.websocketDisconnected(clientId);
    });

    ws.on("error", () => {
      clearInterval(syncInterval);
      unregisterClient(ws);
      logger.websocketDisconnected(clientId);
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "ping" && typeof message.clientSendTime === "number") {
          const serverReceiveTime = Date.now();
          ws.send(
            JSON.stringify({
              type: "pong",
              clientSendTime: message.clientSendTime,
              serverReceiveTime,
              serverSendTime: Date.now(),
            })
          );
          return;
        }

        if (message.type === "subscribe_rally" && message.rallyId) {
          subscribeClientToRally(ws, message.rallyId);
          ws.send(
            JSON.stringify({
              type: "subscribed",
              rallyId: message.rallyId,
              serverTime: Date.now(),
            })
          );
        }
      } catch {
        // ignore malformed messages
      }
    });
  });
}
