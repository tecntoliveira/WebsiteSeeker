# WebsiteSeeker — Curb + Agentic OS Integration

## Runtime model

WebsiteSeeker is powered by **Curb** (the domain application) and **Agentic OS** (the private planning, memory, routing, and task service).

- Curb owns business data, generated sites, validation, previews, deployments, outreach, payments, and deployment credentials.
- Agentic OS owns project context, tasks, research, agent execution, memory, scheduling, and audit history.
- Curb communicates with Agentic OS through the private Docker network using `AGENTIC_OS_API_TOKEN`.
- Agentic OS is not published directly to the host.

## Compose startup

```bash
cp .env.example .env
openssl rand -hex 32
# Set the generated value as AGENTIC_OS_API_TOKEN in .env.
docker compose up --build
```

Curb is available at `http://localhost:3000`. Agentic OS is addressed from Curb as `http://agentic-os:8080`.

## Workspace contract

Agentic OS accepts named workspaces, never arbitrary filesystem paths. The default workspace is `curb` and resolves inside `/workspaces`.

The Compose development profile mounts these paths read-only into Agentic OS:

- `/workspaces/curb/app`
- `/workspaces/curb/prompts`
- `/workspaces/curb/README.md`

Task artifacts can be placed under `/workspaces/tasks`. Do not mount the Curb database, `.env` files, deployment credentials, generated-site volume, or host home directory into Agentic OS.

Code-editing workflows should use a task-specific branch or worktree and return a patch for Curb to review. Curb remains responsible for importing and validating generated site files.

## Curb integration endpoints

Curb exposes server-side proxies:

- `GET /api/agentic-os/health`
- `POST /api/agentic-os/tasks`
- `POST /api/agentic-os/chat`

The browser talks to Curb; only the Curb server holds the Agentic OS service token.

Agentic OS exposes authenticated service endpoints:

- `GET /api/integration/health`
- `POST /api/integration/tasks`
- `POST /api/integration/chat`

Task creation supports an `externalId`/`external_id` for retry-safe idempotency. A repeated request with the same project and external ID returns the existing task.

## Optional OpenCode installation

The Agentic OS image can install OpenCode during the build when the package is available:

```bash
INSTALL_OPENCODE=true docker compose build agentic-os
docker compose up
```

The default is `false` so the dashboard and task/memory service remain reproducible without relying on an external CLI package. Hermes and agy require their own authentication and installation policy and should be added in a follow-up image layer rather than receiving Curb secrets.

## Security boundary

The integration token authenticates Curb-to-Agentic OS calls. It is not a user authentication system. Keep both services local/private until Curb authentication and Agentic OS user authorization are implemented.

Agentic OS executes third-party CLI tools and must run without the Docker socket, as a non-root user, with dropped capabilities and bounded resources. Docker is a containment boundary, not an absolute guarantee against kernel-level escape or malicious outbound behavior.
