import { type NextRequest, NextResponse } from "next/server";
import { incrementCounter } from "@/lib/telemetry/server";

export function proxy(request: NextRequest) {
  incrementCounter(
    "http_requests_total",
    "Total HTTP requests observed at the Next.js proxy boundary.",
    1,
    {
      method: request.method,
      path: request.nextUrl.pathname,
    },
  );

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
