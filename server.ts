import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { setupWebSocket } from "./src/server/websocket";
import { startScheduler } from "./src/server/scheduler";
import { initWebPush } from "./src/lib/push";
import { migrateLegacyData, migrateTemplateSchema, migrateNotificationEnum } from "./src/lib/db-migrate";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
// Next.js custom server convention; do not use process.env.HOSTNAME (container hostname on Render).
const hostname = "localhost";
// Render requires binding to 0.0.0.0:$PORT — never use HOSTNAME for listen().
const bindHost = process.env.BIND_HOST || "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(async () => {
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

    server.on("error", (err) => {
      console.error(JSON.stringify({ event: "server_listen_failed", error: String(err) }));
      process.exit(1);
    });

    server.listen(port, bindHost, () => {
      console.log(
        JSON.stringify({
          event: "server_started",
          url: `http://${bindHost}:${port}`,
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
  })
  .catch((err) => {
    console.error(JSON.stringify({ event: "server_prepare_failed", error: String(err) }));
    process.exit(1);
  });
