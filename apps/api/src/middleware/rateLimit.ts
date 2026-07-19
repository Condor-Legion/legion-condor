import rateLimit from "express-rate-limit";

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const rateLimitWindowMs = getPositiveIntegerEnv("RATE_LIMIT_WINDOW_MS", 60 * 1000);
const loginRateLimitMax = getPositiveIntegerEnv("LOGIN_RATE_LIMIT_MAX", 60);
const defaultRateLimitMax = getPositiveIntegerEnv("RATE_LIMIT_MAX", 240);

export const loginRateLimit = rateLimit({
  windowMs: rateLimitWindowMs,
  max: loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});

export const defaultRateLimit = rateLimit({
  windowMs: rateLimitWindowMs,
  max: defaultRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});
