import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAgenticTask } from "@/lib/agentic-os";

const TaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  project: z.string().trim().min(1).max(100).optional(),
  externalId: z.string().trim().max(200).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  workspace: z.string().trim().regex(/^[A-Za-z0-9_.-]+$/).max(100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const input = TaskSchema.parse(await request.json());
    return NextResponse.json(await createAgenticTask(input), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid Agentic OS task payload.", issues: error.issues },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Agentic OS is unavailable.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
