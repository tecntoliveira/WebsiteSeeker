# Curb Project

## Role
Curb is a local-first outbound website generator for local businesses. It discovers businesses, audits websites, generates static replacement sites, previews them, drafts outreach, and manages deployment and sales workflows.

## Ownership Boundaries
- Curb owns the business database, generated sites, site validation, previews, deployments, outreach, payments, and deployment credentials.
- Agentic OS owns planning, memory, research, task decomposition, agent routing, and work history.
- Never ask an agent to modify Curb production data, deployment credentials, payment data, or send outreach without an explicit approved Curb action.

## Repository Rules
- The Curb app is a Next.js 16 application under `curb/`.
- Curb uses SQLite via `better-sqlite3`.
- Generated static sites live under `sites/<slug>/`.
- Site changes must preserve Curb's bundle validation and promotion pipeline.
- Prefer a task-specific workspace or Git branch for code edits.
- Return changed files, validation results, and unresolved decisions in every implementation summary.

## Default Workflow
1. Understand the business and user outcome.
2. Create a Curb task with acceptance criteria.
3. Research or audit before implementation when facts are uncertain.
4. Make changes in an isolated workspace.
5. Run the narrowest relevant tests and typechecks.
6. Keep Curb as the final authority for persistence, deployment, and external communication.
