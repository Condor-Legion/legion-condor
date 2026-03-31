import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

type PushCommit = {
  added?: string[];
  modified?: string[];
  removed?: string[];
};

type PushPayload = {
  ref?: string;
  commits?: PushCommit[];
};

type Service = "bot" | "api" | "web" | "deploy-listener";
type LogLevel = "info" | "warn" | "error";
type DeployPlan = {
  services: Array<Service | "all">;
  noBuild: boolean;
};

function writeLog(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const entry = {
    level,
    service: "deploy-listener",
    time: new Date().toISOString(),
    msg: message,
    ...(data ?? {}),
  };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

const logger = {
  info(data: Record<string, unknown> | string, message?: string): void {
    if (typeof data === "string") {
      writeLog("info", data);
      return;
    }
    writeLog("info", message ?? "info", data);
  },
  error(data: Record<string, unknown> | string, message?: string): void {
    if (typeof data === "string") {
      writeLog("error", data);
      return;
    }
    writeLog("error", message ?? "error", data);
  },
};

function domainLog(
  level: LogLevel,
  event: string,
  message: string,
  data?: Record<string, unknown>
): void {
  writeLog(level, message, {
    event,
    module: "webhook",
    ...data,
  });
}

function getSignature256(req: Request): string | null {
  const sig = req.headers.get("x-hub-signature-256");
  return sig && sig.startsWith("sha256=") ? sig.slice("sha256=".length) : null;
}

function verifyGitHubSignature(params: {
  bodyUtf8: string;
  signatureHex: string;
  secret: string;
}): boolean {
  const expectedHex = createHmac("sha256", params.secret)
    .update(params.bodyUtf8, "utf8")
    .digest("hex");

  // timingSafeEqual requiere igual longitud
  if (expectedHex.length !== params.signatureHex.length) return false;
  return timingSafeEqual(
    Buffer.from(expectedHex, "hex"),
    Buffer.from(params.signatureHex, "hex")
  );
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items)];
}

function detectDeployPlanFromPaths(paths: string[]): DeployPlan {
  const services = new Set<Service>();
  let composeChanged = false;

  const rootAffectsBuildAll = new Set([
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    ".npmrc",
    "package.json",
  ]);

  for (const p of paths) {
    if (!p) continue;

    if (p === "docker-compose.yml") {
      composeChanged = true;
      continue;
    }

    if (p.startsWith("apps/bot/")) services.add("bot");
    else if (p.startsWith("apps/api/")) services.add("api");
    else if (p.startsWith("apps/web/")) services.add("web");
    else if (p.startsWith("deploy-listener/")) services.add("deploy-listener");
    else if (p.startsWith("prisma/")) services.add("api");
    else if (p.startsWith("packages/shared/")) {
      services.add("bot");
      services.add("api");
      services.add("web");
    } else if (rootAffectsBuildAll.has(p)) {
      services.add("bot");
      services.add("api");
      services.add("web");
    }
  }

  if (composeChanged && services.size === 0) {
    return { services: ["all"], noBuild: true };
  }

  return { services: [...services], noBuild: false };
}

async function spawnDeploy(plan: DeployPlan): Promise<void> {
  const repoDir = process.env.REPO_DIR ?? "/repo";
  const scriptPath = `${repoDir}/scripts/deploy.sh`;
  const cmd = ["sh", scriptPath, ...(plan.noBuild ? ["--no-build"] : []), ...plan.services];

  domainLog("info", "deploy_trigger_started", "deploy started", {
    operation: "deploy_trigger",
    actorType: "webhook",
    actorId: "github",
    outcome: "success",
    services: plan.services,
    noBuild: plan.noBuild,
  });

  const startedAt = Date.now();
  const child = Bun.spawn({
    cmd,
    env: {
      ...process.env,
      REPO_DIR: repoDir,
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  // No esperar al deploy para responder al webhook.
  // Pero registrar cuando termina y con que codigo.
  void child.exited.then((code) => {
    if (code === 0) {
      domainLog("info", "deploy_trigger_completed", "deploy finished OK", {
        operation: "deploy_trigger",
        actorType: "webhook",
        actorId: "github",
        outcome: "success",
        durationMs: Date.now() - startedAt,
        services: plan.services,
        noBuild: plan.noBuild,
      });
      return;
    }

    domainLog("error", "deploy_trigger_failed", "deploy finished with error", {
      operation: "deploy_trigger",
      actorType: "webhook",
      actorId: "github",
      outcome: "internal_error",
      durationMs: Date.now() - startedAt,
      services: plan.services,
      noBuild: plan.noBuild,
      exitCode: code,
    });
  });
}

const port = Number(process.env.PORT ?? "9000");
const secret = process.env.GITHUB_WEBHOOK_SECRET;
if (!secret) {
  logger.error("missing GITHUB_WEBHOOK_SECRET");
  process.exit(1);
}

Bun.serve({
  port,
  async fetch(req) {
    const startedAt = Date.now();
    const url = new URL(req.url);
    const requestId = req.headers.get("x-github-delivery") ?? randomUUID();
    const correlationId = requestId;
    const isDeployPath = url.pathname === "/deploy" || url.pathname === "/deploy/detect";
    if (!isDeployPath) return new Response("Not found", { status: 404 });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const sig = getSignature256(req);
    if (!sig) {
      domainLog("warn", "github_webhook_rejected", "missing signature", {
        operation: "github_webhook_receive",
        actorType: "webhook",
        actorId: "github",
        outcome: "unauthorized",
        reason: "missing_signature",
        requestId,
        correlationId,
      });
      return new Response("Missing signature", { status: 401 });
    }

    const bodyUtf8 = await req.text();
    const ok = verifyGitHubSignature({
      bodyUtf8,
      signatureHex: sig,
      secret,
    });
    if (!ok) {
      domainLog("warn", "github_webhook_rejected", "invalid signature", {
        operation: "github_webhook_receive",
        actorType: "webhook",
        actorId: "github",
        outcome: "unauthorized",
        reason: "invalid_signature",
        requestId,
        correlationId,
      });
      return new Response("Invalid signature", { status: 401 });
    }

    let payload: PushPayload;
    try {
      payload = JSON.parse(bodyUtf8) as PushPayload;
    } catch {
      domainLog("warn", "github_webhook_rejected", "invalid json payload", {
        operation: "github_webhook_receive",
        actorType: "webhook",
        actorId: "github",
        outcome: "validation_error",
        reason: "invalid_json",
        requestId,
        correlationId,
      });
      return new Response("Invalid JSON", { status: 400 });
    }

    // Solo desplegar en pushes a main
    if (payload.ref && payload.ref !== "refs/heads/main") {
      domainLog("info", "github_webhook_ignored", "ignored non-main branch", {
        operation: "github_webhook_receive",
        actorType: "webhook",
        actorId: "github",
        outcome: "success",
        requestId,
        correlationId,
        resourceType: "git_ref",
        resourceId: payload.ref,
      });
      return Response.json({ ok: true, action: "ignored", reason: "branch", ref: payload.ref });
    }

    const commits = payload.commits ?? [];
    const touched = uniqueStrings(
      commits.flatMap((c) => [
        ...(c.added ?? []),
        ...(c.modified ?? []),
        ...(c.removed ?? []),
      ])
    );

    const plan = detectDeployPlanFromPaths(touched);

    // Siempre ejecutamos el script de deploy: si no hay servicios afectados,
    // deploy.sh solo hara git pull y terminara.
    domainLog("info", "github_webhook_received", "webhook validated", {
      operation: "github_webhook_receive",
      actorType: "webhook",
      actorId: "github",
      outcome: "success",
      requestId,
      correlationId,
      resourceType: "git_ref",
      resourceId: payload.ref ?? "refs/heads/main",
      touchedFiles: touched.length,
      services: plan.services,
      noBuild: plan.noBuild,
    });
    await spawnDeploy(plan);
    domainLog("info", "github_webhook_completed", "webhook processing completed", {
      operation: "github_webhook_receive",
      actorType: "webhook",
      actorId: "github",
      outcome: "success",
      requestId,
      correlationId,
      durationMs: Date.now() - startedAt,
      services: plan.services,
      noBuild: plan.noBuild,
    });
    return Response.json({
      ok: true,
      action: plan.services.length === 0 ? "pull-only" : "deploy",
      services: plan.services,
      noBuild: plan.noBuild,
    });
  },
});

logger.info({ port }, "deploy-listener listening");
