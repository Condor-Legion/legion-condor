import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const baseUrl = (__ENV.BASE_URL || "http://localhost:3004").replace(/\/$/, "");
const isLocalTarget = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(baseUrl);
const vus = Number(__ENV.VUS || 10);
const duration = __ENV.DURATION || "3m";

if (!isLocalTarget && __ENV.CONFIRM_TARGET !== baseUrl) {
  throw new Error(
    "Para ejecutar contra una URL no local definí CONFIRM_TARGET exactamente igual a BASE_URL.",
  );
}

if (!__ENV.ADMIN_USERNAME || !__ENV.ADMIN_PASSWORD) {
  throw new Error("Definí ADMIN_USERNAME y ADMIN_PASSWORD para ejecutar este flujo autenticado.");
}

export const options = {
  scenarios: {
    recurringAdmins: {
      executor: "constant-vus",
      vus,
      duration,
      gracefulStop: "15s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1200", "p(99)<2500"],
    checks: ["rate>0.99"],
    application_failures: ["count==0"],
  },
};

const applicationFailures = new Counter("application_failures");
const successfulChecks = new Rate("successful_checks");
const pageFlowDuration = new Trend("page_flow_duration", true);

function request(name, path, params) {
  const response = http.get(`${baseUrl}${path}`, {
    tags: { name },
    ...params,
  });
  const ok = check(response, {
    [`${name}: estado 200`]: (res) => res.status === 200,
    [`${name}: respuesta JSON`]: (res) =>
      String(res.headers["Content-Type"] || "").includes("application/json"),
  });
  successfulChecks.add(ok);
  if (!ok && response.status >= 500) applicationFailures.add(1);
  return response;
}

export function setup() {
  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({
      username: __ENV.ADMIN_USERNAME,
      password: __ENV.ADMIN_PASSWORD,
    }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { name: "POST /api/auth/login (setup)" },
    },
  );

  const authenticated = check(response, {
    "login de preparación: estado 200": (res) => res.status === 200,
    "login de preparación: cookie de sesión": (res) => Boolean(res.cookies.lc_session?.[0]?.value),
  });
  if (!authenticated) fail(`No fue posible autenticar el test (HTTP ${response.status}).`);

  // Una sola sesión evita distorsionar el resultado con el límite de 60 logins/minuto.
  return { sessionToken: response.cookies.lc_session[0].value };
}

export default function ({ sessionToken }) {
  const startedAt = Date.now();
  const params = { headers: { Cookie: `lc_session=${sessionToken}` } };

  // Carga equivalente al panel principal de administración.
  request("GET /api/auth/me", "/api/auth/me", params);
  request("GET /api/roster/events", "/api/roster/events", params);

  // Las pantallas se alternan para representar usuarios que vuelven al panel.
  if (__ITER % 2 === 0) {
    request("GET /api/stats/members-report", "/api/stats/members-report", params);
  } else {
    request("GET /api/roster/templates", "/api/roster/templates", params);
    request("GET /api/roster/catalog/maps", "/api/roster/catalog/maps", params);
    request("GET /api/roster/catalog/sides", "/api/roster/catalog/sides", params);
  }

  pageFlowDuration.add(Date.now() - startedAt);
  sleep(Number(__ENV.THINK_TIME_SECONDS || 3));
}

export function teardown({ sessionToken }) {
  http.post(`${baseUrl}/api/auth/logout`, null, {
    headers: { Cookie: `lc_session=${sessionToken}` },
    tags: { name: "POST /api/auth/logout (teardown)" },
  });
}
