import "server-only";

import { OKX_CONFIG } from "@/lib/configs/okx";
import {
  debug,
  error,
  incrementCounter,
  info,
  setGauge,
  warn,
} from "@/lib/telemetry/server";

type OkxWsChannel = "tickers" | "books5";

type OkxWsEvent =
  | {
      channel: OkxWsChannel;
      instId: string;
      data: Record<string, unknown>;
    }
  | {
      event: "connected" | "error";
      message?: string;
    };

type WsListener = (event: OkxWsEvent) => void;

type SubscriptionKey = `${OkxWsChannel}:${string}`;

const RECONNECT_DELAY_MS = 3_000;

class OkxPublicWsClient {
  private socket: WebSocket | null = null;
  private connectionState:
    | "idle"
    | "connecting"
    | "connected"
    | "degraded"
    | "error" = "idle";
  private listeners = new Set<WsListener>();
  private subscriptions = new Set<SubscriptionKey>();
  private reconnectTimer: NodeJS.Timeout | null = null;

  private syncConnectionGauges() {
    setGauge(
      "okx_ws_connected",
      "Whether the OKX public websocket is currently connected.",
      this.connectionState === "connected" ? 1 : 0,
    );
    setGauge(
      "okx_ws_subscriptions",
      "Number of active OKX websocket subscriptions.",
      this.subscriptions.size,
    );
  }

  private setConnectionState(
    nextState: "idle" | "connecting" | "connected" | "degraded" | "error",
    message?: string,
  ) {
    this.connectionState = nextState;
    this.syncConnectionGauges();

    if (message) {
      const attributes = {
        state: nextState,
        subscriptions: this.subscriptions.size,
        message,
      };

      if (nextState === "connected") {
        info("okx.ws", message, attributes);
      } else if (nextState === "error") {
        error("okx.ws", message, attributes);
      } else {
        warn("okx.ws", message, attributes);
      }
    }
  }

  subscribe(channel: OkxWsChannel, symbol: string) {
    const key: SubscriptionKey = `${channel}:${symbol}`;
    this.subscriptions.add(key);
    this.syncConnectionGauges();
    debug("okx.ws", "Registered websocket subscription", {
      channel,
      symbol,
      subscriptions: this.subscriptions.size,
    });
    this.ensureConnected();

    if (this.connectionState === "connected") {
      this.sendSubscription("subscribe", [{ channel, instId: symbol }]);
    }
  }

  addListener(listener: WsListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState() {
    return this.connectionState;
  }

  private emit(event: OkxWsEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private ensureConnected() {
    if (typeof WebSocket === "undefined") {
      this.setConnectionState(
        "error",
        "WebSocket runtime is unavailable in this environment.",
      );
      this.emit({
        event: "error",
        message: "WebSocket runtime is unavailable in this environment.",
      });
      return;
    }

    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.setConnectionState("connecting", "Connecting to OKX websocket.");
    this.socket = new WebSocket(OKX_CONFIG.wsUrl);

    this.socket.addEventListener("open", () => {
      this.setConnectionState("connected", "Connected to OKX websocket.");
      incrementCounter(
        "okx_ws_connections_total",
        "Total OKX websocket connection openings.",
      );
      this.emit({ event: "connected" });
      this.sendSubscription(
        "subscribe",
        [...this.subscriptions].map((key) => {
          const [channel, instId] = key.split(":");
          return {
            channel: channel as OkxWsChannel,
            instId,
          };
        }),
      );
    });

    this.socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      this.handleMessage(event.data);
    });

    this.socket.addEventListener("close", () => {
      this.setConnectionState(
        "degraded",
        "OKX websocket closed; waiting to reconnect.",
      );
      incrementCounter(
        "okx_ws_disconnects_total",
        "Total OKX websocket disconnects.",
      );
      this.scheduleReconnect();
    });

    this.socket.addEventListener("error", () => {
      this.setConnectionState("error", "OKX websocket connection error.");
      incrementCounter(
        "okx_ws_errors_total",
        "Total OKX websocket connection errors.",
      );
      this.emit({
        event: "error",
        message: "OKX websocket connection error.",
      });
      this.scheduleReconnect();
    });
  }

  private handleMessage(raw: string) {
    try {
      const payload = JSON.parse(raw) as
        | {
            event?: string;
            msg?: string;
          }
        | {
            arg?: {
              channel?: OkxWsChannel;
              instId?: string;
            };
            data?: Array<Record<string, unknown>>;
          };

      if ("event" in payload && payload.event) {
        if (payload.event === "error") {
          this.setConnectionState(
            "error",
            payload.msg ?? "Unknown OKX websocket error",
          );
          incrementCounter(
            "okx_ws_errors_total",
            "Total OKX websocket connection errors.",
          );
          this.emit({
            event: "error",
            message: payload.msg ?? "Unknown OKX websocket error",
          });
        }
        return;
      }

      if (
        !("arg" in payload) ||
        !payload.arg?.channel ||
        !payload.arg?.instId
      ) {
        return;
      }

      const data = payload.data?.[0];
      if (!data) {
        return;
      }

      this.emit({
        channel: payload.arg.channel,
        instId: payload.arg.instId,
        data,
      });
    } catch {
      this.setConnectionState(
        "error",
        "Failed to parse OKX websocket payload.",
      );
      incrementCounter(
        "okx_ws_parse_errors_total",
        "Total OKX websocket payload parse errors.",
      );
      this.emit({
        event: "error",
        message: "Failed to parse OKX websocket payload.",
      });
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    warn("okx.ws", "Scheduling websocket reconnect.", {
      delayMs: RECONNECT_DELAY_MS,
      subscriptions: this.subscriptions.size,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, RECONNECT_DELAY_MS);
  }

  private sendSubscription(
    op: "subscribe" | "unsubscribe",
    args: Array<{ channel: OkxWsChannel; instId: string }>,
  ) {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN ||
      args.length === 0
    ) {
      return;
    }

    debug("okx.ws", "Sending websocket subscription payload", {
      operation: op,
      args,
    });
    this.socket.send(
      JSON.stringify({
        op,
        args,
      }),
    );
  }
}

let singleton: OkxPublicWsClient | null = null;

export function getOkxPublicWsClient() {
  if (!singleton) {
    singleton = new OkxPublicWsClient();
  }

  return singleton;
}
