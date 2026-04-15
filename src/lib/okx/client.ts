import crypto from "node:crypto";
import { OKX_CONFIG } from "@/lib/configs/okx";

interface OkxEnvelope<T> {
  code: string;
  msg: string;
  data: T[];
}

function createSignature(
  timestamp: string,
  method: string,
  path: string,
  body = "",
): string {
  return crypto
    .createHmac("sha256", OKX_CONFIG.secret)
    .update(`${timestamp}${method}${path}${body}`)
    .digest("base64");
}

async function requestOkx<T>(
  path: string,
  init: RequestInit = {},
  authenticated = false,
): Promise<T[]> {
  const url = `${OKX_CONFIG.baseUrl}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  if (authenticated) {
    const timestamp = new Date().toISOString();
    const body = typeof init.body === "string" ? init.body : "";
    headers.set("OK-ACCESS-KEY", OKX_CONFIG.apiKey);
    headers.set("OK-ACCESS-PASSPHRASE", OKX_CONFIG.passphrase);
    headers.set("OK-ACCESS-TIMESTAMP", timestamp);
    headers.set(
      "OK-ACCESS-SIGN",
      createSignature(
        timestamp,
        (init.method ?? "GET").toUpperCase(),
        path,
        body,
      ),
    );
  }

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`OKX request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as OkxEnvelope<T>;
  if (payload.code !== "0") {
    throw new Error(payload.msg || `OKX returned error code ${payload.code}`);
  }

  return payload.data;
}

export async function okxPublicGet<T>(
  path: string,
  params: URLSearchParams,
): Promise<T[]> {
  return requestOkx<T>(`${path}?${params.toString()}`);
}

export async function okxPrivateGet<T>(
  path: string,
  params?: URLSearchParams,
): Promise<T[]> {
  const requestPath = params ? `${path}?${params.toString()}` : path;
  return requestOkx<T>(requestPath, { method: "GET" }, true);
}

export async function okxPrivatePost<T>(
  path: string,
  body: Record<string, string | undefined>,
): Promise<T[]> {
  const cleanBody = Object.fromEntries(
    Object.entries(body).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
  const bodyJson = JSON.stringify(cleanBody);

  return requestOkx<T>(
    path,
    {
      method: "POST",
      body: bodyJson,
    },
    true,
  );
}
