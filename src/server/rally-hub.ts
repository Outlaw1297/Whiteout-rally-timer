import { WebSocket } from "ws";

interface RallyClient {
  ws: WebSocket;
  rallyId?: string;
}

const clients = new Map<WebSocket, RallyClient>();

export function registerClient(ws: WebSocket) {
  clients.set(ws, { ws });
}

export function unregisterClient(ws: WebSocket) {
  clients.delete(ws);
}

export function subscribeClientToRally(ws: WebSocket, rallyId: string) {
  const client = clients.get(ws);
  if (client) client.rallyId = rallyId;
}

export function broadcastToRally(rallyId: string, payload: Record<string, unknown>) {
  const message = JSON.stringify({ rallyId, ...payload });
  clients.forEach(({ ws, rallyId: subscribedId }) => {
    if (subscribedId === rallyId && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

export function broadcastRallyUpdate(
  rallyId: string,
  rally: Record<string, unknown>
) {
  broadcastToRally(rallyId, { type: "rally_update", rally });
}

export function broadcastRallyStarted(
  rallyId: string,
  rally: Record<string, unknown>
) {
  broadcastToRally(rallyId, { type: "rally_started", rally });
}

export function broadcastRallyCancelled(rallyId: string) {
  broadcastToRally(rallyId, { type: "rally_cancelled", rallyId });
}
