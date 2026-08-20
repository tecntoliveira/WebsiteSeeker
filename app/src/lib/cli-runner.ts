import { spawn } from "node:child_process";
import fs from "fs";
import os from "os";
import path from "path";

import type { AvailableCliAgent, CliAgentId } from "./cli-agents";

const CLI_RUN_TIMEOUT_MS = 10 * 60 * 1_000;
const CURSOR_MAX_PROMPT_CHARS = 40_000;

export interface CliAgentRunOptions {
  agent: AvailableCliAgent;
  prompt: string;
  systemPrompt?: string;
  images?: string[];
  cwd?: string;
  model?: string | null;
  toolEditing?: boolean;
}

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

function runProcess(
  binary: string,
  args: string[],
  options: { input?: string; cwd?: string }
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        // Keep CLIs from opening interactive browsers or pager UIs.
        CI: "1",
        NO_COLOR: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(
        new Error(
          `${binary} did not respond within ${CLI_RUN_TIMEOUT_MS / 1000}s. The local agent may be stuck or waiting for input.`
        )
      );
    }, CLI_RUN_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });

    if (options.input != null) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

function buildCodexArgs(
  options: CliAgentRunOptions
): string[] {
  const args = ["exec", "-", "--skip-git-repo-check"];

  if (options.toolEditing) {
    args.push("-s", "workspace-write");
  } else {
    args.push("-s", "read-only");
  }

  if (options.cwd) {
    args.push("-C", options.cwd);
  }

  if (options.model) {
    args.push("-m", options.model);
  }

  for (const image of options.images ?? []) {
    args.push("-i", image);
  }

  return args;
}

function buildClaudeArgs(options: CliAgentRunOptions): {
  args: string[];
  prompt: string;
} {
  const args = ["-p", "--output-format", "text"];

  if (options.systemPrompt) {
    args.push("--append-system-prompt", options.systemPrompt);
  }

  if (options.model) {
    args.push("--model", options.model);
  }

  let prompt = options.prompt;
  for (const image of options.images ?? []) {
    prompt += `\n\nRefer to the attached image at this path: ${image}`;
  }

  return { args, prompt };
}

function buildCursorAgentArgs(options: CliAgentRunOptions): {
  args: string[];
} {
  const args = ["-p", options.prompt, "--output-format", "text"];

  if (options.systemPrompt) {
    args.push("--append-system-prompt", options.systemPrompt);
  }

  if (options.model) {
    args.push("--model", options.model);
  }

  return { args };
}

function buildOpenCodeArgs(options: CliAgentRunOptions): {
  args: string[];
  promptFile: string | null;
} {
  const args = ["run", "--format", "default"];

  if (options.model) {
    args.push("--model", options.model);
  }

  let promptFile: string | null = null;

  for (const image of options.images ?? []) {
    args.push("--file", image);
  }

  if (options.prompt.length > CURSOR_MAX_PROMPT_CHARS) {
    promptFile = path.join(
      os.tmpdir(),
      `curb-opencode-${Date.now()}.md`
    );
    fs.writeFileSync(promptFile, options.prompt, "utf-8");
    args.push(
      "--file",
      promptFile,
      "Execute the instructions in the attached file. Return only the requested output."
    );
  } else {
    args.push(options.prompt);
  }

  return { args, promptFile };
}

function cleanCliErrorOutput(stderr: string): string {
  const meaningfulLines = stderr.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "user") {
      return false;
    }

    return !/^(OpenAI Codex|----+$|workdir:|model:|provider:|approval:|sandbox:|reasoning|session id)/i.test(
      trimmed
    );
  });

  return meaningfulLines.join("\n").trim().slice(0, 400);
}

export async function runCliAgentText(
  options: CliAgentRunOptions
): Promise<string> {
  const agent = options.agent;
  const cwd = options.cwd ?? path.resolve(process.cwd(), "..");

  switch (agent.id as CliAgentId) {
    case "codex": {
      const result = await runProcess(agent.binary, buildCodexArgs(options), {
        input: options.prompt,
        cwd,
      });

      const text = result.stdout.trim();
      if (!text) {
        throw new Error(
          `Codex CLI returned no text${result.stderr ? `: ${cleanCliErrorOutput(result.stderr)}` : ""}`
        );
      }
      return text;
    }

    case "claude": {
      const { args, prompt } = buildClaudeArgs(options);
      const result = await runProcess(agent.binary, args, {
        input: prompt,
        cwd,
      });

      const text = result.stdout.trim();
      if (!text) {
        throw new Error(
          `Claude Code returned no text${result.stderr ? `: ${cleanCliErrorOutput(result.stderr)}` : ""}`
        );
      }
      return text;
    }

    case "cursor-agent": {
      if (options.prompt.length > CURSOR_MAX_PROMPT_CHARS) {
        throw new Error(
          "Cursor Agent does not accept stdin prompts, and this prompt is too large to pass as an argument. Use Codex CLI or Claude Code instead."
        );
      }

      const { args } = buildCursorAgentArgs(options);
      const result = await runProcess(agent.binary, args, {
        input: undefined,
        cwd,
      });

      const text = result.stdout.trim();
      if (!text) {
        throw new Error(
          `Cursor Agent returned no text${result.stderr ? `: ${cleanCliErrorOutput(result.stderr)}` : ""}`
        );
      }
      return text;
    }

    case "opencode": {
      const { args, promptFile } = buildOpenCodeArgs(options);

      try {
        const result = await runProcess(agent.binary, args, {
          input: undefined,
          cwd,
        });

        const text = result.stdout.trim();
        if (!text) {
          throw new Error(
            `OpenCode returned no text${result.stderr ? `: ${cleanCliErrorOutput(result.stderr)}` : ""}`
          );
        }
        return text;
      } finally {
        if (promptFile) {
          fs.rmSync(promptFile, { force: true });
        }
      }
    }

    default:
      throw new Error(
        `${agent.label} is detected but does not support headless execution in Curb yet. Use Codex CLI or Claude Code instead.`
      );
  }
}
