import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getPresignedUrl, uploadFile } from "@/lib/storage";
import {
  getOperatorUnauthorizedResponse,
  isOperatorAuthorized,
} from "@/lib/telemetry/auth";

export const dynamic = "force-dynamic";

function resolveBucket(value: FormDataEntryValue | null) {
  return value === "exports" || value === "artifacts" ? value : "uploads";
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export async function POST(request: NextRequest) {
  if (!isOperatorAuthorized(request)) {
    return getOperatorUnauthorizedResponse();
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Attach a file field in multipart form data." },
      { status: 400 },
    );
  }

  const bucket = resolveBucket(formData.get("bucket"));
  const requestedKey = formData.get("key");
  const key =
    typeof requestedKey === "string" && requestedKey.trim().length > 0
      ? requestedKey.trim()
      : `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${sanitizeFileName(file.name || "upload.bin")}`;

  const body = Buffer.from(await file.arrayBuffer());
  await uploadFile(bucket, key, body, file.type || "application/octet-stream");

  return NextResponse.json({
    data: {
      bucket,
      key,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      url: await getPresignedUrl(bucket, key),
    },
    timestamp: new Date().toISOString(),
  });
}
