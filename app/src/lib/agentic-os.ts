import { z } from "zod";

const AGENTIC_OS_TIMEOUT_MS = 15_000;

const AgenticTaskResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  project: z.string().optional(),
});

const AgenticChatResponseSchema = z.object({
  status: z.string(),
  response: z.object({
    content: z.string(),
    agent: z.string(),
  }),
});

export interface AgenticTaskInput {
  title: string;
  body: string;
  project?: string;
  externalId?: string;
  priority?: string;
  workspace?: string;
}

export interface AgenticChatInput {
  message: string;
  agent?: "auto" | "opencode" | "hermes" | "agy";
  workspace?: string;
}

function getAgenticOsUrl(): string {
  return (process.env.AGENTIC_OS_URL ?? "http://agentic-os:8080")
    .trim()
    .replace(/\/+$/, "");
}

function getAgenticOsToken(): string {
  const token = process.env.AGENTIC_OS_API_TOKEN?.trim();
  if (!token) {
    throw new Error("AGENTIC_OS_API_TOKEN is not configured.");
  }
  return token;
}

async function agenticRequest<T>(
  pathname: string,
  init: RequestInit,
  schema: z.ZodType<T>
): Promise<T> {
  const response = await fetch(`${getAgenticOsUrl()}${pathname}`, {
    ...init,
    signal: AbortSignal.timeout(AGENTIC_OS_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${getAgenticOsToken()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String(payload.detail)
        : `Agentic OS request failed with status ${response.status}.`;
    throw new Error(detail);
  }

  return schema.parse(payload);
}

export async function getAgenticOsHealth(): Promise<unknown> {
  return agenticRequest("/api/integration/health", { method: "GET" }, z.unknown());
}

export async function createAgenticTask(input: AgenticTaskInput) {
  const payload = {
    title: input.title,
    body: input.body,
    project: input.project ?? "curb",
    external_id: input.externalId ?? null,
    priority: input.priority ?? "medium",
    workspace: input.workspace ?? "curb",
  };

  return agenticRequest(
    "/api/integration/tasks",
    { method: "POST", body: JSON.stringify(payload) },
    AgenticTaskResponseSchema
  );
}

export async function chatWithAgenticOs(input: AgenticChatInput) {
  return agenticRequest(
    "/api/integration/chat",
    {
      method: "POST",
      body: JSON.stringify({
        message: input.message,
        agent: input.agent ?? "auto",
        workspace: input.workspace ?? "curb",
      }),
    },
    AgenticChatResponseSchema
  );
}
