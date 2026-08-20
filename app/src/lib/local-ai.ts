import { spawnSync } from "node:child_process";

import type { Config } from "./config";

const LOCAL_PROBE_TIMEOUT_MS = 2_000;

interface LocalAiCandidate {
  id: string;
  label: string;
  baseUrl: string;
}

const LOCAL_AI_CANDIDATES: LocalAiCandidate[] = [
  { id: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434" },
  { id: "lm-studio", label: "LM Studio", baseUrl: "http://127.0.0.1:1234" },
  { id: "llamacpp", label: "llama.cpp", baseUrl: "http://127.0.0.1:8080" },
];

export interface LocalAiServer {
  id: string;
  label: string;
  baseUrl: string;
  models: string[];
}

export interface LocalAiRuntime {
  baseUrl: string;
  apiKey: string;
  model: string;
  providerLabel: string;
  serverLabel: string;
}

const VISION_MODEL_PATTERN =
  /(?:^|[-_.:\s])(?:vision|vl|vlx|minicpm|llava|moondream|bakllava|gemma[34])(?:$|[-_.:\s])|gemma[34]|qwen2[.-]?5?vl|qwen2-vl/i;

function normalizeBaseUrl(rawBaseUrl: string): string {
  return rawBaseUrl.trim().replace(/\/+$/, "");
}

export function toOpenAiCompatibleBaseUrl(rawBaseUrl: string): string {
  const normalized = normalizeBaseUrl(rawBaseUrl);
  return /\/v1$/i.test(normalized) ? normalized : `${normalized}/v1`;
}

export function toDisplayBaseUrl(openAiBaseUrl: string): string {
  return normalizeBaseUrl(openAiBaseUrl).replace(/\/v1$/i, "");
}

function candidateBaseUrls(): LocalAiCandidate[] {
  const candidates = [...LOCAL_AI_CANDIDATES];

  const ollamaHost = process.env.OLLAMA_HOST?.trim();
  if (ollamaHost) {
    candidates[0] = {
      ...candidates[0],
      baseUrl: normalizeBaseUrl(ollamaHost.replace(/^https?:\/\//, "http://")),
    };
  }

  return candidates;
}

async function probeLocalServer(
  candidate: LocalAiCandidate
): Promise<LocalAiServer | null> {
  const baseUrl = normalizeBaseUrl(candidate.baseUrl);

  const openAiBaseUrl = toOpenAiCompatibleBaseUrl(baseUrl);

  try {
    const response = await fetch(`${openAiBaseUrl}/models`, {
      signal: AbortSignal.timeout(LOCAL_PROBE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const models: string[] = [];

    if (payload && typeof payload === "object") {
      const data = (payload as Record<string, unknown>).data;
      const modelList = (payload as Record<string, unknown>).models;

      if (Array.isArray(data)) {
        for (const entry of data) {
          if (typeof entry === "string") {
            models.push(entry);
            continue;
          }

          if (entry && typeof entry === "object") {
            const id = (entry as Record<string, unknown>).id;
            if (typeof id === "string" && id.trim()) {
              models.push(id);
            }
          }
        }
      } else if (Array.isArray(modelList)) {
        for (const entry of modelList) {
          if (typeof entry === "string") {
            models.push(entry);
            continue;
          }

          if (entry && typeof entry === "object") {
            const record = entry as Record<string, unknown>;
            const name = record.name;
            const id = record.id;
            if (typeof name === "string" && name.trim()) {
              models.push(name);
            } else if (typeof id === "string" && id.trim()) {
              models.push(id);
            }
          }
        }
      }
    }

    return {
      id: candidate.id,
      label: candidate.label,
      baseUrl: openAiBaseUrl,
      models: Array.from(new Set(models.map((model) => model.trim()).filter(Boolean))),
    };
  } catch {
    return null;
  }
}

function pickLocalModel(
  server: LocalAiServer,
  preferred: string | null
): string | null {
  const preferredModel = preferred?.trim();

  if (preferredModel) {
    if (server.models.length === 0) {
      return preferredModel;
    }

    if (server.models.includes(preferredModel)) {
      return preferredModel;
    }
  }

  if (server.models.length === 0) {
    return preferredModel || null;
  }

  const visionModels = server.models.filter((model) =>
    VISION_MODEL_PATTERN.test(model)
  );

  return visionModels[0] ?? server.models[0];
}

export async function detectLocalAiServers(): Promise<LocalAiServer[]> {
  const results = await Promise.all(
    candidateBaseUrls().map((candidate) => probeLocalServer(candidate))
  );

  return results.filter(
    (server): server is LocalAiServer => server !== null
  );
}

function isOllamaCliInstalled(): boolean {
  try {
    const result = spawnSync("ollama", ["--version"], {
      timeout: 2_000,
      stdio: "ignore",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function getNoLocalServerError(): string {
  if (isOllamaCliInstalled()) {
    return [
      "Ollama is installed but its server is not running.",
      "Start it with `ollama serve` (or open the Ollama app) and retry.",
      "Curb also detects LM Studio and llama.cpp if you prefer those.",
    ].join(" ");
  }

  return "No local AI server detected. Start Ollama, LM Studio, or llama.cpp, or set a Local Base URL in Settings.";
}

export async function resolveLocalAiRuntime(config: Config): Promise<LocalAiRuntime> {
  const explicitBaseUrl = config.localBaseUrl.trim();

  if (explicitBaseUrl) {
    const candidate = {
      id: "custom",
      label: "Local AI",
      baseUrl: normalizeBaseUrl(explicitBaseUrl),
    };
    const server = await probeLocalServer(candidate);

    if (!server) {
      throw new Error(
        `Local AI server at ${candidate.baseUrl} is not reachable. Start it or check the Local Base URL in Settings.`
      );
    }

    const model = pickLocalModel(server, config.localModel);

    if (!model) {
      throw new Error(
        `Local AI server at ${candidate.baseUrl} is running but has no models loaded. Load or pull a model, then set it in Settings.`
      );
    }

    return {
      baseUrl: server.baseUrl,
      apiKey: config.localApiKey.trim(),
      model,
      providerLabel: `Local AI (${toDisplayBaseUrl(server.baseUrl)})`,
      serverLabel: toDisplayBaseUrl(server.baseUrl),
    };
  }

  const servers = await detectLocalAiServers();

  if (servers.length === 0) {
    throw new Error(getNoLocalServerError());
  }

  const server = servers[0];
  const model = pickLocalModel(server, config.localModel);

  if (!model) {
    throw new Error(
      `${server.label} is running but has no models loaded. Load or pull a model, then select it in Settings.`
    );
  }

  return {
    baseUrl: server.baseUrl,
    apiKey: config.localApiKey.trim(),
    model,
    providerLabel: `Local AI (${server.label})`,
    serverLabel: server.label,
  };
}
