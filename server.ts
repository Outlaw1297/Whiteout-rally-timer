import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { setupWebSocket } from "./src/server/websocket";
import { startScheduler } from "./src/server/scheduler";
import { initWebPush } from "./src/lib/push";
import { migrateLegacyData, migrateTemplateSchema, migrateNotificationEnum } from "./src/lib/db-migrate";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  initWebPush();

  try {
    await migrateLegacyData();
    await migrateTemplateSchema();
    await migrateNotificationEnum();
  } catch (err) {
    console.error(JSON.stringify({ event: "startup_migration_failed", error: String(err) }));
  }

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });
  setupWebSocket(wss);

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url || "");

    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  startScheduler();

  server.listen(port, hostname, () => {
    console.log(
      JSON.stringify({
        event: "server_started",
        url: `http://${hostname}:${port}`,
        env: process.env.NODE_ENV,
      })
    );
  });

  const shutdown = () => {
    console.log(JSON.stringify({ event: "server_shutting_down" }));
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
});
