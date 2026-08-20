import { NextRequest, NextResponse } from "next/server";
import { detectAvailableCliAgents } from "@/lib/cli-agents";
import {
  getConfig,
  initializeSettingsStore,
  type AiProvider,
  type AnthropicAuthMode,
  type OpenAIAuthMode,
} from "@/lib/config";
import {
  listProviderModelsFromApi,
  type ProviderModelDraft,
} from "@/lib/provider-models";

interface ModelsRequestBody {
  provider?: unknown;
  credentials?: Record<string, unknown>;
  forceRefresh?: unknown;
}

function normalizeProvider(value: unknown): AiProvider | null {
  if (
    value === "anthropic" ||
    value === "openai" ||
    value === "google" ||
    value === "openrouter" ||
    value === "local" ||
    value === "cli"
  ) {
    return value;
  }

  return null;
}

function normalizeAnthropicAuthMode(value: unknown): AnthropicAuthMode {
  return value === "oauth" ? "oauth" : "apiKey";
}

function normalizeOpenAIAuthMode(value: unknown): OpenAIAuthMode {
  return value === "oauth" ? "oauth" : "apiKey";
}

function normalizeDraftCredentials(
  credentials: Record<string, unknown> | undefined
): ProviderModelDraft {
  if (!credentials) {
    return {};
  }

  return {
    aiProvider: normalizeProvider(credentials.provider) ?? undefined,
    anthropicApiKey: String(credentials.anthropicApiKey ?? ""),
    anthropicAuthMode: normalizeAnthropicAuthMode(
      credentials.anthropicAuthMode
    ),
    anthropicModel: String(credentials.anthropicModel ?? "").trim(),
    openaiApiKey: String(credentials.openaiApiKey ?? ""),
    openaiAuthMode: normalizeOpenAIAuthMode(credentials.openaiAuthMode),
    openaiModel: String(credentials.openaiModel ?? "").trim(),
    googleApiKey: String(credentials.googleApiKey ?? ""),
    googleModel: String(credentials.googleModel ?? "").trim(),
    openrouterApiKey: String(credentials.openrouterApiKey ?? ""),
    openrouterModel: String(credentials.openrouterModel ?? "").trim(),
    localBaseUrl: String(credentials.localBaseUrl ?? "").trim(),
    localModel: String(credentials.localModel ?? "").trim(),
    localApiKey: String(credentials.localApiKey ?? ""),
    cliAgent: String(credentials.cliAgent ?? "").trim(),
    cliModel: String(credentials.cliModel ?? "").trim(),
  };
}

export async function POST(request: NextRequest) {
  try {
    initializeSettingsStore();

    const body = (await request.json().catch(() => null)) as
      | ModelsRequestBody
      | null;
    const provider = normalizeProvider(body?.provider);

    if (!provider) {
      return NextResponse.json(
        { error: "A valid provider is required." },
        { status: 400 }
      );
    }

    const result = await listProviderModelsFromApi(provider, {
      config: getConfig(),
      draft: normalizeDraftCredentials(body?.credentials),
      forceRefresh: body?.forceRefresh === true,
    });

    if (provider === "cli") {
      return NextResponse.json({
        ...result,
        agents: detectAvailableCliAgents(),
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Load provider models error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load provider models";
    const status =
      message.startsWith("Enter ") ||
      message.startsWith("Connect ") ||
      message.startsWith("No local AI server detected") ||
      message.startsWith("No CLI agent is available") ||
      message.includes("is not reachable") ||
      message.includes("has no models loaded") ||
      message.includes("(401") ||
      message.includes("(403")
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
