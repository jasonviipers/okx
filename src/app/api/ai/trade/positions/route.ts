import { NextResponse } from "next/server";
import { getPositions } from "@/lib/okx/orders";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const positions = await getPositions();

    return NextResponse.json({
      positions,
      count: positions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] /api/trade/positions error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
