import { type NextRequest, NextResponse } from "next/server";
import { sqlite, vectorSearchEnabled } from "@/db";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { isGoogleGenerativeAIConfigured } from "@/lib/ai/google";
import {
  getOperatorUnauthorizedResponse,
  isOperatorAuthorized,
} from "@/lib/telemetry/auth";
import { insertVector } from "@/lib/vector";

export const dynamic = "force-dynamic";

type BackfillRow = {
  id: number;
  summary: string;
};

export async function POST(request: NextRequest) {
  if (!isOperatorAuthorized(request)) {
    return getOperatorUnauthorizedResponse();
  }

  if (!isGoogleGenerativeAIConfigured()) {
    return NextResponse.json(
      { error: "Google Generative AI is not configured for embeddings." },
      { status: 503 },
    );
  }

  if (!vectorSearchEnabled) {
    return NextResponse.json(
      {
        error: "Vector search is unavailable on this runtime.",
        details:
          "sqlite-vss is not supported in this environment; use linux-x64 or darwin for vector backfill.",
      },
      { status: 503 },
    );
  }

  let rows: BackfillRow[];
  try {
    rows = sqlite
      .prepare(
        `SELECT id, summary
         FROM swarm_memory
         WHERE id NOT IN (SELECT rowid FROM swarm_memory_vss)
         ORDER BY id ASC`,
      )
      .all() as BackfillRow[];
  } catch (error) {
    return NextResponse.json(
      {
        error: "Vector search is not available.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }

  let processed = 0;

  for (const row of rows) {
    const embedding = await generateEmbedding(row.summary);
    if (!embedding) {
      continue;
    }

    const inserted = await insertVector(row.id, embedding);
    if (inserted) {
      processed += 1;
    }
  }

  return NextResponse.json({ processed });
}
