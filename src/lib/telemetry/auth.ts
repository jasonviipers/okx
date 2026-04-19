import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/env";

function getOperatorToken() {
  return env.TELEMETRY_TOKEN ?? env.CRON_SECRET;
}

export function isOperatorAuthorized(
  request: Pick<NextRequest, "headers">,
): boolean {
  const expectedToken = getOperatorToken();
  if (!expectedToken) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${expectedToken}`;
}

export function getOperatorUnauthorizedResponse() {
  return NextResponse.json(
    { error: "Unauthorized" },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
