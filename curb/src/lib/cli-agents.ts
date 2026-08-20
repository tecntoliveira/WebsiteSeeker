import { spawnSync } from "node:child_process";
import fs from "fs";
import os from "os";
import path from "path";

import type { Config } from "./config";

const DETECTION_TIMEOUT_MS = 1_500;

export type CliAgentId =
  | "codex"
  | "opencode"
  | "claude"
  | "cursor-agent"
  | "kiro"
  | "freebuff";

export interface CliAgentSpec {
  id: CliAgentId;
  label: string;
  binary: string;
  supportsText: boolean;
  supportsImages: boolean;
  supportsToolEditing: boolean;
  loginHint: string;
  checkAvailable(): boolean;
}

export interface AvailableCliAgent {
  id: CliAgentId;
  label: string;
  binary: string;
  supportsText: boolean;
  supportsImages: boolean;
  supportsToolEditing: boolean;
}

export const CLI_AGENT_PREFERENCE: CliAgentId[] = [
  "codex",
  "opencode",
  "claude",
  "cursor-agent",
  "kiro",
  "freebuff",
];

function homeDir(): string {
  return os.homedir();
}

function binaryExists(binary: string): boolean {
  try {
    const result = spawnSync(binary, ["--version"], {
      timeout: DETECTION_TIMEOUT_MS,
      stdio: "ignore",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function binaryOnPath(binary: string): boolean {
  try {
    const result = spawnSync("sh", ["-c", `command -v ${JSON.stringify(binary)}`], {
      timeout: DETECTION_TIMEOUT_MS,
      stdio: "ignore",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function envVarIsSet(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

const CLI_AGENTS: CliAgentSpec[] = [
  {
    id: "codex",
    label: "Codex CLI",
    binary: "codex",
    supportsText: true,
    supportsImages: true,
    supportsToolEditing: true,
    loginHint: "Log in with `codex login`.",
    checkAvailable() {
      if (!binaryExists(this.binary)) {
        return false;
      }

      const authPath = path.join(homeDir(), ".codex", "auth.json");
      return fs.existsSync(authPath) || envVarIsSet("OPENAI_API_KEY");
    },
  },
  {
    id: "opencode",
    label: "OpenCode",
    binary: "opencode",
    supportsText: true,
    supportsImages: true,
    supportsToolEditing: false,
    loginHint: "Log in with `opencode auth login`.",
    checkAvailable() {
      if (!binaryExists(this.binary)) {
        return false;
      }

      const authPath = path.join(
        homeDir(),
        ".local",
        "share",
        "opencode",
        "auth.json"
      );
      return fs.existsSync(authPath);
    },
  },
  {
    id: "claude",
    label: "Claude Code",
    binary: "claude",
    supportsText: true,
    supportsImages: true,
    supportsToolEditing: false,
    loginHint: "Log in by running `claude` once.",
    checkAvailable() {
      if (!binaryExists(this.binary)) {
        return false;
      }

      if (envVarIsSet("ANTHROPIC_API_KEY")) {
        return true;
      }

      const credentialsPath = path.join(homeDir(), ".claude", ".credentials.json");
      if (fs.existsSync(credentialsPath)) {
        return true;
      }

      const configPath = path.join(homeDir(), ".claude.json");
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
            oauthAccount?: unknown;
          };
          if (config.oauthAccount) {
            return true;
          }
        } catch {
          return false;
        }
      }

      return false;
    },
  },
  {
    id: "cursor-agent",
    label: "Cursor Agent",
    binary: "cursor-agent",
    supportsText: true,
    supportsImages: false,
    supportsToolEditing: false,
    loginHint: "Log in with `cursor-agent` and your Cursor account.",
    checkAvailable() {
      if (!binaryExists(this.binary)) {
        return false;
      }

      const cursorDir = path.join(homeDir(), ".cursor");
      return fs.existsSync(cursorDir);
    },
  },
  {
    id: "kiro",
    label: "Kiro",
    binary: "kiro",
    supportsText: false,
    supportsImages: false,
    supportsToolEditing: false,
    loginHint: "Log in with `kiro` (browser flow).",
    checkAvailable() {
      return binaryExists(this.binary);
    },
  },
  {
    id: "freebuff",
    label: "Freebuff CLI",
    binary: "freebuff",
    supportsText: false,
    supportsImages: false,
    supportsToolEditing: false,
    loginHint: "Log in with `freebuff login`.",
    checkAvailable() {
      return binaryExists(this.binary);
    },
  },
];

export function getCliAgentSpec(id: CliAgentId): CliAgentSpec | null {
  return CLI_AGENTS.find((agent) => agent.id === id) ?? null;
}

export function detectAvailableCliAgents(): AvailableCliAgent[] {
  return CLI_AGENTS.filter((agent) => agent.checkAvailable()).map((agent) => ({
    id: agent.id,
    label: agent.label,
    binary: agent.binary,
    supportsText: agent.supportsText,
    supportsImages: agent.supportsImages,
    supportsToolEditing: agent.supportsToolEditing,
  }));
}

export interface CliAgentRuntime {
  agent: AvailableCliAgent;
  model: string | null;
  providerLabel: string;
}

export function getCliAgentCandidates(config: Config): AvailableCliAgent[] {
  const available = detectAvailableCliAgents();
  const preferredAgentId = config.cliAgent.trim() as CliAgentId;

  if (preferredAgentId) {
    const matched = available.find((agent) => agent.id === preferredAgentId);
    if (!matched) {
      const spec = getCliAgentSpec(preferredAgentId);
      throw new Error(
        spec
          ? `${spec.label} was selected but is not available. ${spec.loginHint}`
          : `The selected CLI agent "${preferredAgentId}" is not supported.`
      );
    }

    return [matched];
  }

  if (available.length === 0) {
    const states = CLI_AGENTS.map((agent) => ({
      spec: agent,
      onPath: binaryOnPath(agent.binary),
      working: binaryExists(agent.binary),
    }));
    const broken = states
      .filter((state) => state.onPath && !state.working)
      .map((state) => `${state.spec.label} is installed but not working (its postinstall may not have run; reinstall without --ignore-scripts)`);
    const unauthenticated = states
      .filter((state) => state.onPath && state.working)
      .map((state) => `${state.spec.label} is installed but not authenticated (${state.spec.loginHint})`);

    const detail =
      broken.length > 0 || unauthenticated.length > 0
        ? [...broken, ...unauthenticated].join("; ") + "."
        : "No supported CLI agent binaries were found on PATH. Install Codex, OpenCode, Claude Code, or Cursor Agent.";

    throw new Error(
      `No CLI agent is available. ${detail} You can also use a local AI server or an API key in Settings.`
    );
  }

  return available;
}

export function resolveCliAgentRuntime(config: Config): CliAgentRuntime {
  const candidates = getCliAgentCandidates(config);
  const selected = candidates.find((agent) => agent.supportsText) ?? candidates[0];

  return {
    agent: selected,
    model: config.cliModel.trim() || null,
    providerLabel: `CLI Agent (${selected.label})`,
  };
}
