import { createHmac, timingSafeEqual } from "node:crypto";

type PushCommit = {
  added?: string[];
  modified?: string[];
  removed?: string[];
};

type PushPayload = {
  commits?: PushCommit[];
};

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

function detectServicesFromPaths(paths: string[]): Array<"bot" | "api" | "web"> {
  const services = new Set<"bot" | "api" | "web">();

  const rootAffectsAll = new Set([
    "docker-compose.yml",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    ".npmrc",
    "package.json",
  ]);

  for (const p of paths) {
    if (!p) continue;

    if (p.startsWith("apps/bot/")) services.add("bot");
    else if (p.startsWith("apps/api/")) services.add("api");
    else if (p.startsWith("apps/web/")) services.add("web");
    else if (p.startsWith("packages/shared/")) {
      services.add("bot");
      services.add("api");
      services.add("web");
    } else if (rootAffectsAll.has(p)) {
      services.add("bot");
      services.add("api");
      services.add("web");
    }
  }

  return [...services];
}

async function spawnDeploy(services: Array<"bot" | "api" | "web">): Promise<void> {
  const repoDir = process.env.REPO_DIR ?? "/repo";
  const scriptPath = `${repoDir}/scripts/deploy.sh`;
  const cmd = ["sh", scriptPath, ...services];

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
  // Si el proceso muere rápido, queda logueado por stderr/stdout.
  void child.exited;
}

const port = Number(process.env.PORT ?? "9000");
const secret = process.env.GITHUB_WEBHOOK_SECRET;
if (!secret) {
  console.error("Falta GITHUB_WEBHOOK_SECRET");
  process.exit(1);
}

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const isDeployPath = url.pathname === "/deploy" || url.pathname === "/deploy/detect";
    if (!isDeployPath) return new Response("Not found", { status: 404 });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const sig = getSignature256(req);
    if (!sig) return new Response("Missing signature", { status: 401 });

    const bodyUtf8 = await req.text();
    const ok = verifyGitHubSignature({
      bodyUtf8,
      signatureHex: sig,
      secret,
    });
    if (!ok) return new Response("Invalid signature", { status: 401 });

    let payload: PushPayload;
    try {
      payload = JSON.parse(bodyUtf8) as PushPayload;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const commits = payload.commits ?? [];
    const touched = uniqueStrings(
      commits.flatMap((c) => [
        ...(c.added ?? []),
        ...(c.modified ?? []),
        ...(c.removed ?? []),
      ])
    );

    const services = detectServicesFromPaths(touched);

    // Siempre ejecutamos el script de deploy: si no hay servicios afectados,
    // deploy.sh solo hará git pull y terminará.
    await spawnDeploy(services);
    return Response.json({
      ok: true,
      action: services.length === 0 ? "pull-only" : "deploy",
      services,
    });
  },
});

console.log(`[deploy-listener] listening on :${port}`);

