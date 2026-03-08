import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import { authRouter } from "./routes/auth";
import { membersRouter } from "./routes/members";
import { rosterRouter } from "./routes/roster";
import { importRouter } from "./routes/import";
import { statsRouter } from "./routes/stats";
import { auditRouter } from "./routes/audit";
import { discordRouter } from "./routes/discord";
import { ticketsRouter } from "./routes/tickets";
import { createSocketServer } from "./socket";
import { defaultRateLimit } from "./middleware/rateLimit";
import { requestLoggerMiddleware, apiLogger } from "./middleware/requestLogger";
import { startCondorPolling } from "./services/condorPolling";
import { domainLoggerMiddleware } from "./middleware/domainLogger";

const app = express();
const server = http.createServer(app);
const io = createSocketServer(server);
app.set("io", io);

app.use(requestLoggerMiddleware);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    credentials: true
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(defaultRateLimit);

app.use(
  "/api/auth",
  domainLoggerMiddleware({ module: "auth", sampleSuccess: false }),
  authRouter
);
app.use(
  "/api/members",
  domainLoggerMiddleware({ module: "members" }),
  membersRouter
);
app.use(
  "/api/roster",
  domainLoggerMiddleware({ module: "roster", sampleSuccess: false }),
  rosterRouter
);
app.use(
  "/api/import",
  domainLoggerMiddleware({ module: "import", sampleSuccess: false }),
  importRouter
);
app.use("/api/stats", domainLoggerMiddleware({ module: "stats" }), statsRouter);
app.use("/api/audit", domainLoggerMiddleware({ module: "audit" }), auditRouter);
app.use(
  "/api/discord",
  domainLoggerMiddleware({ module: "discord", sampleSuccess: false }),
  discordRouter
);
app.use(
  "/api/tickets",
  domainLoggerMiddleware({ module: "tickets", sampleSuccess: false }),
  ticketsRouter
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Siempre responde al cliente aunque falle un handler (p. ej. errores de Prisma)
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const log = req.log ?? apiLogger;
    log.error({ err }, "unhandled API error");
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error" });
  }
);

import("./prisma")
  .then(({ prisma }) => {
    process.on("beforeExit", () => prisma.$disconnect());
  })
  .catch(() => {});

io.on("connection", (socket) => {
  socket.on("join", (room) => socket.join(room));
});

const port = Number(process.env.API_PORT ?? 3001);
server.listen(port, () => {
  apiLogger.info({ port }, "API listening");
  startCondorPolling(apiLogger.child({ service: "condor-polling" }));
});
