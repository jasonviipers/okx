import "server-only";

import crypto from "node:crypto";
import { isOkxDemoMode, OKX_CONFIG } from "@/lib/configs/okx";

interface OkxEnvelope<T> {
  code?: string;
  msg?: string;
  sCode?: string;
  sMsg?: string;
  data: T[];
}

interface OkxErrorLike {
  code?: string;
  msg?: string;
  sCode?: string;
  sMsg?: string;
  data?: Array<
    | {
        code?: string;
        msg?: string;
        sCode?: string;
        sMsg?: string;
      }
    | Record<string, unknown>
  >;
}

export class OkxRequestError extends Error {
  status: number;
  responseText?: string;
  code?: string;
  subCode?: string;

  constructor(
    message: string,
    status: number,
    responseText?: string,
    code?: string,
    subCode?: string,
  ) {
    super(message);
    this.name = "OkxRequestError";
    this.status = status;
    this.responseText = responseText;
    this.code = code;
    this.subCode = subCode;
  }
}

function safeParseJson(value: string): OkxErrorLike | null {
  try {
    return JSON.parse(value) as OkxErrorLike;
  } catch {
    return null;
  }
}

function pickOkxErrorFields(payload?: OkxErrorLike | null): {
  code?: string;
  subCode?: string;
  message?: string;
} {
  if (!payload) {
    return {};
  }

  const detail = payload.data?.find((row) => {
    if (!row || typeof row !== "object") {
      return false;
    }

    return "sCode" in row || "code" in row || "sMsg" in row || "msg" in row;
  }) as
    | {
        code?: string;
        msg?: string;
        sCode?: string;
        sMsg?: string;
      }
    | undefined;

  return {
    code: payload.code || detail?.code,
    subCode: payload.sCode || detail?.sCode,
    message: payload.msg || payload.sMsg || detail?.sMsg || detail?.msg,
  };
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

  if (isOkxDemoMode()) {
    headers.set("x-simulated-trading", "1");
  }

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const responseText = await response.text();
    const parsed = safeParseJson(responseText);
    const errorFields = pickOkxErrorFields(parsed);
    throw new OkxRequestError(
      errorFields.message
        ? `OKX request failed with status ${response.status}: ${errorFields.message}`
        : `OKX request failed with status ${response.status}`,
      response.status,
      responseText,
      errorFields.code,
      errorFields.subCode,
    );
  }

  const payload = (await response.json()) as OkxEnvelope<T>;
  const errorFields = pickOkxErrorFields(payload as OkxErrorLike);
  const topLevelCode = payload.code ?? payload.sCode;
  const isSuccess = !topLevelCode || topLevelCode === "0";

  if (!isSuccess) {
    throw new OkxRequestError(
      errorFields.message ||
        `OKX returned error code ${topLevelCode ?? "unknown"}`,
      response.status,
      JSON.stringify(payload),
      errorFields.code,
      errorFields.subCode,
    );
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
