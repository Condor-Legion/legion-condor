# AGENTS.md

This file contains guidelines and commands for agentic coding agents working in the Legion Condor repository.

## Repository Overview

This is a TypeScript monorepo using pnpm workspaces with the following structure:
- `apps/bot` - Discord bot (Bun runtime, CommonJS)
- `apps/api` - Express API with Socket.io (CommonJS)
- `apps/web` - Next.js frontend with React (ESNext)
- `packages/shared` - Shared types, schemas, constants, and utilities (CommonJS)

Prisma lives at repo root: `prisma/schema.prisma`. Migrations, seed and Prisma CLI commands run from the repository root.

## Build & Development Commands

### Root Commands (run from repository root)
```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start all development servers
pnpm dev

# Lint all packages (if lint scripts exist)
pnpm lint

# Database operations
pnpm prisma:generate       # Generate Prisma client
pnpm prisma:migrate        # Run database migrations (dev)
pnpm prisma:deploy         # Deploy migrations to production
pnpm seed                  # Seed database with initial data
pnpm migrate:legacy:stats  # One-off: migrate legacy stats from Google Sheets (see DOCKER_SETUP.md)
```

### App-specific Commands
```bash
# Bot (Discord)
cd apps/bot && pnpm dev    # Start bot in watch mode
cd apps/bot && pnpm build  # Build bot
cd apps/bot && pnpm start  # Run built bot

# API (Express)
cd apps/api && pnpm dev    # Start API in watch mode  
cd apps/api && pnpm build  # Build API
cd apps/api && pnpm start  # Run built API

# Web (Next.js)
cd apps/web && pnpm dev    # Start Next.js dev server
cd apps/web && pnpm build  # Build for production
cd apps/web && pnpm start  # Start production server
cd apps/web && pnpm lint   # Run Next.js linter

# Shared Package
cd packages/shared && pnpm build  # Build shared package
```

### Testing Commands
Note: No comprehensive test setup is currently configured. If adding tests:
- For unit tests: Add `test` script to package.json
- For single test: Use pattern like `pnpm test -- path/to/test.test.ts`

## Code Style Guidelines

### TypeScript Configuration
- Strict mode enabled in `tsconfig.base.json`
- Target: ES2022
- Backend apps use CommonJS, frontend uses ESNext
- Always use type annotations for complex return types
- Prefer `interface` over `type` for object shapes

### Import Organization
Always organize imports in this exact order:

```typescript
// 1. External libraries (sorted alphabetically)
import express from "express";
import bcrypt from "bcrypt";
import { z } from "zod";

// 2. Internal packages (@legion/*)
import { memberSchema } from "@legion/shared";

// 3. Local modules (relative imports)
import { prisma } from "../prisma";
import { requireAdmin } from "../auth";
```

#### Import Styles
- Default imports: `import express from "express"`
- Named imports: `import { Client, GatewayIntentBits } from "discord.js"`
- Type-only imports: `import type { Member } from "./types"`
- Use `export * from "./module"` in shared package index files

### Naming Conventions
- **Functions**: camelCase, descriptive verbs (`createMember`, `syncGameData`)
- **Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE only for environment-derived values
- **Files**: kebab-case for utilities (`auth-helper.ts`), PascalCase for React components (`Button.tsx`)
- **Components**: PascalCase (`UserProfile`, `GameAccountForm`)
- **Interfaces**: PascalCase, descriptive names (`GameAccount`, `MemberProfile`)

### Error Handling Patterns

#### API Routes
```typescript
// Validation first
const parsed = schema.safeParse(req.body);
if (!parsed.success) {
  return res.status(400).json({ error: "Invalid payload" });
}

// Consistent error responses
res.status(401).json({ error: "Unauthorized" });
res.status(404).json({ error: "Not found" });
res.status(409).json({ error: "Resource already exists" });

// Use global error handler for unexpected errors
```

#### Async Operations
```typescript
try {
  const result = await someAsyncOperation();
  return result;
} catch (error) {
  console.error("Operation failed:", error);
  throw new Error("Detailed error message for debugging");
}
```

### Validation Patterns
- Use Zod schemas for all input validation
- Define schemas in `@legion/shared` when used across apps
- Use `safeParse()` with proper error handling
- Example schema structure:

```typescript
export const memberSchema = z.object({
  discordId: z.string().min(3),
  displayName: z.string().min(1),
  gameAccounts: z.array(
    z.object({
      provider: z.enum(["STEAM", "EPIC", "XBOX_PASS"]),
      providerId: z.string().min(3),
    })
  ).optional(),
});
```

### Database Patterns
- Always use Prisma ORM
- Include related data with `include` when needed
- Return full objects from API endpoints
- Use transactions for multi-step operations

```typescript
const member = await prisma.member.findUnique({
  where: { id: memberId },
  include: { gameAccounts: true }
});
```

### React/Next.js Patterns
- Use forwardRef for composable components
- Implement variants with class-variance-authority (CVA)
- Use Radix UI primitives with custom styling
- Follow App Router conventions

```typescript
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
```

### File Organization
```
src/
├── index.ts              # Entry point
├── config.ts             # Environment configuration
├── prisma.ts             # Prisma client instance (API)
├── [domain]/             # Feature domains
│   ├── handlers.ts       # Event/route handlers
│   ├── types.ts          # Domain-specific types
│   └── [module].ts       # Main logic
├── routes/               # Express routes (API)
├── middleware/           # Express middleware
├── services/             # Business logic / validation services (API)
├── utils/                # Utilities and helpers (lib/ in some apps)
├── events/               # Discord event handlers (Bot)
└── commands/             # Discord commands (Bot)
```

### Configuration Management
- Centralize configuration in `config.ts` files
- Use environment variables with validation
- Provide type-safe config objects
- Use `ensureConfig()` functions for required environment variables

```typescript
export const config = {
  discordToken: process.env.DISCORD_TOKEN,
  databaseUrl: process.env.DATABASE_URL,
} as const;

export function ensureBotConfig(): void {
  if (!config.discordToken) {
    console.error("DISCORD_TOKEN is required");
    process.exit(1);
  }
}
```

## Working with Shared Package
- The `@legion/shared` package contains common types, schemas, constants, and utilities (see `packages/shared/src/`)
- Always add new shared types to the shared package
- Update shared package version when making breaking changes
- Use workspace protocol `"@legion/shared": "workspace:*"` in dependencies
- Root `prepare` script builds shared on `pnpm install`; after editing shared, run `pnpm build` (or `pnpm run --filter @legion/shared build`) so dependent apps see changes

## Docker
- `docker-compose.yml` defines services: postgres, api, web, bot
- Each app has a `Dockerfile`; API entrypoint runs `prisma migrate deploy` before starting
- Full setup and troubleshooting: see **DOCKER_SETUP.md**
- Key env for Docker: `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `BOT_API_KEY`; for web build args: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`

## Environment
- Copy `.env.example` to `.env` and fill in values
- Required for API: `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (for seed), `BOT_API_KEY` (for bot ↔ API)
- Bot: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`; optional: `DISCORD_GUILD_ID`, tickets roles, stats channel, etc.
- Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL` (default localhost:3001 in dev)

## Development Workflow
1. Run `pnpm build` after changing the shared package (root `prepare` only builds shared on install)
2. Use `pnpm dev` from root to run all apps in watch mode (bot and API use `bun --watch`)
3. Test database changes with `pnpm prisma:migrate` (from root; requires `DATABASE_URL` in `.env`)
4. Always run `pnpm build` before committing to ensure TypeScript compilation succeeds

## Technology Stack Notes
- **Runtime**: Bun for dev (bot, API), Node.js for production; Next.js for web
- **Validation**: Zod throughout; schemas and shared types in `@legion/shared`
- **Database**: Prisma ORM (schema at `prisma/schema.prisma`)
- **API**: Express, express-async-errors, cookie-parser, CORS, express-rate-limit, Socket.io
- **Web**: Next.js App Router, Tailwind CSS, Radix UI (e.g. Slot), class-variance-authority (CVA), socket.io-client
- **Real-time**: Socket.io (server in API, client in web)