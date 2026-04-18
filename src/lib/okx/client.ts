import "server-only";

import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { isOkxDemoMode, OKX_CONFIG } from "@/lib/configs/okx";
import {
  error,
  incrementCounter,
  observeHistogram,
  withTelemetrySpan,
} from "@/lib/telemetry/server";

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
  data?: unknown;
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

  const detail = hasDataArray<
    | {
        code?: string;
        msg?: string;
        sCode?: string;
        sMsg?: string;
      }
    | Record<string, unknown>
  >(payload)
    ? (payload.data.find((row) => {
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
        | undefined)
    : undefined;

  return {
    code: payload.code || detail?.code,
    subCode: payload.sCode || detail?.sCode,
    message: payload.msg || payload.sMsg || detail?.sMsg || detail?.msg,
  };
}

function hasDataArray<T>(payload: unknown): payload is OkxEnvelope<T> {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      Array.isArray((payload as { data?: unknown }).data),
  );
}

function resolveOkxMetricCode(input: {
  responseOk: boolean;
  topLevelCode?: string;
  code?: string;
  caughtError?: unknown;
}): string {
  if (!input.responseOk) {
    if (!input.code && input.caughtError) {
      if (input.caughtError instanceof OkxRequestError) {
        return input.caughtError.code ?? "unknown";
      }

      return "transport_error";
    }

    return input.code ?? "http_error";
  }

  if (input.topLevelCode) {
    return input.topLevelCode;
  }

  if (input.code) {
    return input.code;
  }

  if (input.caughtError instanceof SyntaxError) {
    return "parse_error";
  }

  if (input.caughtError instanceof OkxRequestError) {
    return input.caughtError.code ?? "unknown";
  }

  return input.responseOk ? "0" : "transport_error";
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
  return withTelemetrySpan(
    {
      name: "okx.request",
      source: "okx.client",
      attributes: {
        path,
        method: (init.method ?? "GET").toUpperCase(),
        authenticated,
      },
    },
    async (span) => {
      const startedAt = performance.now();
      const method = (init.method ?? "GET").toUpperCase();
      const url = `${OKX_CONFIG.baseUrl}${path}`;
      const endpoint = path.split("?")[0] ?? path;
      const headers = new Headers(init.headers);
      let response: Response | undefined;
      let durationRecorded = false;
      let requestCountRecorded = false;
      let resultCount: number | undefined;
      headers.set("Content-Type", "application/json");

      if (authenticated) {
        const timestamp = new Date().toISOString();
        const body = typeof init.body === "string" ? init.body : "";
        headers.set("OK-ACCESS-KEY", OKX_CONFIG.apiKey);
        headers.set("OK-ACCESS-PASSPHRASE", OKX_CONFIG.passphrase);
        headers.set("OK-ACCESS-TIMESTAMP", timestamp);
        headers.set(
          "OK-ACCESS-SIGN",
          createSignature(timestamp, method, path, body),
        );
      }

      if (isOkxDemoMode()) {
        headers.set("x-simulated-trading", "1");
      }

      try {
        response = await fetch(url, {
          ...init,
          headers,
          cache: "no-store",
        });
        const durationMs = Number((performance.now() - startedAt).toFixed(3));
        span.setAttribute("statusCode", response.status);
        observeHistogram(
          "okx_request_duration_ms",
          "Duration of OKX HTTP requests in milliseconds.",
          durationMs,
          {
            labels: {
              endpoint,
              method,
              authenticated,
              status: response.status,
            },
          },
        );
        durationRecorded = true;

        if (!response.ok) {
          const responseText = await response.text();
          const parsed = safeParseJson(responseText);
          const errorFields = pickOkxErrorFields(parsed);
          const okxCode = resolveOkxMetricCode({
            responseOk: false,
            code: errorFields.code,
          });
          span.addAttributes({
            okxCode,
            okxSubCode: errorFields.subCode,
          });
          incrementCounter(
            "okx_requests_total",
            "Total OKX HTTP requests.",
            1,
            {
              method,
              authenticated,
              status: response.status,
              ok: false,
              endpoint,
              okxCode,
            },
          );
          requestCountRecorded = true;
          error("okx.client", "OKX request failed", {
            path,
            method,
            status: response.status,
            code: errorFields.code,
            subCode: errorFields.subCode,
            message: errorFields.message,
          });
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

        const payload = (await response.json()) as OkxErrorLike;
        const errorFields = pickOkxErrorFields(payload);
        const topLevelCode = payload.code ?? payload.sCode;
        const isSuccess = !topLevelCode || topLevelCode === "0";
        const okxCode = resolveOkxMetricCode({
          responseOk: true,
          topLevelCode,
          code: errorFields.code,
        });
        span.addAttributes({
          okxCode,
          okxSubCode: errorFields.subCode,
        });

        if (!isSuccess) {
          incrementCounter(
            "okx_requests_total",
            "Total OKX HTTP requests.",
            1,
            {
              method,
              authenticated,
              status: response.status,
              ok: false,
              endpoint,
              okxCode,
            },
          );
          requestCountRecorded = true;
          error("okx.client", "OKX request returned business error", {
            path,
            method,
            status: response.status,
            code: errorFields.code,
            subCode: errorFields.subCode,
            topLevelCode,
            message: errorFields.message,
          });
          throw new OkxRequestError(
            errorFields.message ||
              `OKX returned error code ${topLevelCode ?? "unknown"}`,
            response.status,
            JSON.stringify(payload),
            topLevelCode ?? errorFields.code,
            errorFields.subCode,
          );
        }

        if (!hasDataArray<T>(payload)) {
          incrementCounter(
            "okx_requests_total",
            "Total OKX HTTP requests.",
            1,
            {
              method,
              authenticated,
              status: response.status,
              ok: false,
              endpoint,
              okxCode: "malformed_response",
            },
          );
          requestCountRecorded = true;
          throw new OkxRequestError(
            "OKX response payload is missing a data array.",
            response.status,
            JSON.stringify(payload),
            "malformed_response",
            errorFields.subCode,
          );
        }

        incrementCounter("okx_requests_total", "Total OKX HTTP requests.", 1, {
          method,
          authenticated,
          status: response.status,
          ok: true,
          endpoint,
          okxCode,
        });
        requestCountRecorded = true;
        resultCount = payload.data.length;
        span.setAttribute("resultCount", resultCount);
        return payload.data;
      } catch (caughtError) {
        const durationMs = Number((performance.now() - startedAt).toFixed(3));
        const status = response?.status ?? "unknown";
        if (!durationRecorded) {
          observeHistogram(
            "okx_request_duration_ms",
            "Duration of OKX HTTP requests in milliseconds.",
            durationMs,
            {
              labels: {
                endpoint,
                method,
                authenticated,
                status,
              },
            },
          );
        }
        if (!requestCountRecorded) {
          const okxCode = resolveOkxMetricCode({
            responseOk: Boolean(response?.ok),
            code:
              caughtError instanceof OkxRequestError
                ? caughtError.code
                : undefined,
            caughtError,
          });
          incrementCounter(
            "okx_requests_total",
            "Total OKX HTTP requests.",
            1,
            {
              method,
              authenticated,
              status,
              ok: false,
              endpoint,
              okxCode,
            },
          );
          error("okx.client", "OKX request failed before a valid payload", {
            path,
            method,
            statusCode: response?.status,
            okxCode,
            error:
              caughtError instanceof Error
                ? caughtError.message
                : String(caughtError),
          });
        }
        if (response) {
          span.setAttribute("statusCode", response.status);
        }
        if (resultCount !== undefined) {
          span.setAttribute("resultCount", resultCount);
        }
        if (caughtError instanceof OkxRequestError) {
          span.addAttributes({
            okxCode: caughtError.code,
            okxSubCode: caughtError.subCode,
          });
        }
        span.setAttribute(
          "errorMessage",
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError),
        );
        throw caughtError;
      }
    },
  );
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
