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
import { webhookRouter } from "./routes/webhook";
import { createSocketServer } from "./socket";
import { defaultRateLimit } from "./middleware/rateLimit";

const app = express();
const server = http.createServer(app);
const io = createSocketServer(server);
app.set("io", io);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(defaultRateLimit);

app.use("/api/auth", authRouter);
app.use("/api/members", membersRouter);
app.use("/api/roster", rosterRouter);
app.use("/api/import", importRouter);
app.use("/api/stats", statsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/discord", discordRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/webhook", webhookRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Siempre responde al cliente aunque falle un handler (p. ej. errores de Prisma)
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("API error:", err);
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
  console.log(`API listening on port ${port}`);
});
