import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatWithAgenticOs } from "@/lib/agentic-os";

const ChatSchema = z.object({
  message: z.string().trim().min(1).max(10_000),
  agent: z.enum(["auto", "opencode", "hermes", "agy"]).optional(),
  workspace: z.string().trim().regex(/^[A-Za-z0-9_.-]+$/).max(100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const input = ChatSchema.parse(await request.json());
    return NextResponse.json(await chatWithAgenticOs(input));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid Agentic OS chat payload.", issues: error.issues },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Agentic OS is unavailable.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
