import { NextResponse } from "next/server";
import { getAgenticOsHealth } from "@/lib/agentic-os";

export async function GET() {
  try {
    return NextResponse.json(await getAgenticOsHealth());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Agentic OS is unavailable.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
