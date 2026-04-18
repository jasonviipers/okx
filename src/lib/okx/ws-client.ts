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

export type OkxWsChannel = "tickers" | "books5";

type OkxWsEvent =
  | {
      channel: OkxWsChannel;
      instId: string;
      data: Record<string, unknown>;
    }
  | {
      event: "connected" | "disconnected" | "error";
      message?: string;
    }
  | {
      event: "subscribed" | "subscription_error";
      channel?: OkxWsChannel;
      instId?: string;
      code?: string;
      message?: string;
    };

type WsListener = (event: OkxWsEvent) => void;

type SubscriptionKey = `${OkxWsChannel}:${string}`;

const RECONNECT_DELAY_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;

class OkxPublicWsClient {
  private socket: WebSocket | null = null;
  private connectionState:
    | "idle"
    | "connecting"
    | "connected"
    | "degraded"
    | "error" = "idle";
  private listeners = new Set<WsListener>();
  private desiredSubscriptions = new Set<SubscriptionKey>();
  private activeSubscriptions = new Set<SubscriptionKey>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastPongAt = 0;

  private toSubscriptionKey(
    channel: OkxWsChannel,
    instId: string,
  ): SubscriptionKey {
    return `${channel}:${instId}`;
  }

  private parseSubscriptionKey(key: SubscriptionKey) {
    const [channel, instId] = key.split(":");
    return {
      channel: channel as OkxWsChannel,
      instId,
    };
  }

  private syncConnectionGauges() {
    setGauge(
      "okx_ws_connected",
      "Whether the OKX public websocket is currently connected.",
      this.connectionState === "connected" ? 1 : 0,
    );
    setGauge(
      "okx_ws_subscriptions",
      "Number of active OKX websocket subscriptions.",
      this.activeSubscriptions.size,
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
        subscriptions: this.activeSubscriptions.size,
        desiredSubscriptions: this.desiredSubscriptions.size,
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
    const key = this.toSubscriptionKey(channel, symbol);
    const added = !this.desiredSubscriptions.has(key);
    this.desiredSubscriptions.add(key);
    if (added) {
      debug("okx.ws", "Registered websocket subscription", {
        channel,
        symbol,
        desiredSubscriptions: this.desiredSubscriptions.size,
      });
    }
    this.ensureConnected();

    if (
      this.connectionState === "connected" &&
      (added || !this.activeSubscriptions.has(key))
    ) {
      this.sendSubscription("subscribe", [{ channel, instId: symbol }]);
    }
  }

  unsubscribe(channel: OkxWsChannel, symbol: string) {
    const key = this.toSubscriptionKey(channel, symbol);
    const removedDesired = this.desiredSubscriptions.delete(key);
    const removedActive = this.activeSubscriptions.delete(key);
    if (!removedDesired && !removedActive) {
      return;
    }

    this.syncConnectionGauges();
    debug("okx.ws", "Removed websocket subscription", {
      channel,
      symbol,
      desiredSubscriptions: this.desiredSubscriptions.size,
      activeSubscriptions: this.activeSubscriptions.size,
    });
    if (this.connectionState === "connected") {
      this.sendSubscription("unsubscribe", [{ channel, instId: symbol }]);
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

  private markSubscriptionActive(channel: OkxWsChannel, instId: string) {
    const key = this.toSubscriptionKey(channel, instId);
    if (this.activeSubscriptions.has(key)) {
      return;
    }

    this.activeSubscriptions.add(key);
    this.syncConnectionGauges();
    debug("okx.ws", "Websocket subscription active", {
      channel,
      instId,
      activeSubscriptions: this.activeSubscriptions.size,
    });
  }

  private clearActiveSubscriptions(reason?: string) {
    if (this.activeSubscriptions.size === 0) {
      return;
    }

    const cleared = this.activeSubscriptions.size;
    this.activeSubscriptions.clear();
    this.syncConnectionGauges();
    warn("okx.ws", "Cleared active websocket subscriptions", {
      reason,
      cleared,
      desiredSubscriptions: this.desiredSubscriptions.size,
    });
  }

  private startHeartbeat(socket: WebSocket) {
    this.stopHeartbeat();
    this.lastPongAt = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      if (Date.now() - this.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        warn("okx.ws", "OKX websocket heartbeat timed out; reconnecting.", {
          timeoutMs: HEARTBEAT_TIMEOUT_MS,
          activeSubscriptions: this.activeSubscriptions.size,
        });
        socket.close();
        return;
      }

      socket.send("ping");
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private resendDesiredSubscriptions() {
    this.sendSubscription(
      "subscribe",
      [...this.desiredSubscriptions].map((key) =>
        this.parseSubscriptionKey(key),
      ),
    );
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
    const socket = new WebSocket(OKX_CONFIG.wsUrl);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }

      this.activeSubscriptions.clear();
      this.syncConnectionGauges();
      this.setConnectionState("connected", "Connected to OKX websocket.");
      incrementCounter(
        "okx_ws_connections_total",
        "Total OKX websocket connection openings.",
      );
      this.startHeartbeat(socket);
      this.emit({ event: "connected" });
      this.resendDesiredSubscriptions();
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) {
        return;
      }

      if (typeof event.data !== "string") {
        return;
      }

      this.handleMessage(event.data);
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) {
        return;
      }

      this.stopHeartbeat();
      this.socket = null;
      this.clearActiveSubscriptions("socket closed");
      this.setConnectionState(
        "degraded",
        "OKX websocket closed; waiting to reconnect.",
      );
      incrementCounter(
        "okx_ws_disconnects_total",
        "Total OKX websocket disconnects.",
      );
      this.emit({
        event: "disconnected",
        message: "OKX websocket closed; waiting to reconnect.",
      });
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      if (this.socket !== socket) {
        return;
      }

      this.stopHeartbeat();
      this.clearActiveSubscriptions("socket error");
      this.setConnectionState("error", "OKX websocket connection error.");
      incrementCounter(
        "okx_ws_errors_total",
        "Total OKX websocket connection errors.",
      );
      this.emit({
        event: "error",
        message: "OKX websocket connection error.",
      });
      this.socket = null;
      try {
        socket.close();
      } catch {
        // ignore close races while reconnect scheduling proceeds
      }
      this.scheduleReconnect();
    });
  }

  private handleMessage(raw: string) {
    if (raw === "pong") {
      this.lastPongAt = Date.now();
      return;
    }

    try {
      const payload = JSON.parse(raw) as {
        event?: string;
        code?: string;
        msg?: string;
        arg?: {
          channel?: OkxWsChannel;
          instId?: string;
        };
        data?: Array<Record<string, unknown>>;
      };

      if ("event" in payload && payload.event) {
        if (
          payload.event === "subscribe" &&
          payload.arg?.channel &&
          payload.arg?.instId
        ) {
          this.markSubscriptionActive(payload.arg.channel, payload.arg.instId);
          this.emit({
            event: "subscribed",
            channel: payload.arg.channel,
            instId: payload.arg.instId,
            message: payload.msg,
          });
          return;
        }

        if (payload.event === "error") {
          incrementCounter(
            "okx_ws_errors_total",
            "Total OKX websocket connection errors.",
          );
          if (payload.arg?.channel || payload.arg?.instId) {
            if (payload.arg?.channel && payload.arg?.instId) {
              const key = this.toSubscriptionKey(
                payload.arg.channel,
                payload.arg.instId,
              );
              this.activeSubscriptions.delete(key);
              this.syncConnectionGauges();
            }
            warn("okx.ws", "OKX websocket subscription rejected", {
              channel: payload.arg?.channel,
              instId: payload.arg?.instId,
              code: payload.code,
              message: payload.msg,
            });
            this.emit({
              event: "subscription_error",
              channel: payload.arg?.channel,
              instId: payload.arg?.instId,
              code: payload.code,
              message:
                payload.msg ?? "Unknown OKX websocket subscription error",
            });
            return;
          }

          this.setConnectionState(
            "error",
            payload.msg ?? "Unknown OKX websocket error",
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

      this.markSubscriptionActive(payload.arg.channel, payload.arg.instId);
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

    if (this.desiredSubscriptions.size === 0) {
      return;
    }

    warn("okx.ws", "Scheduling websocket reconnect.", {
      delayMs: RECONNECT_DELAY_MS,
      desiredSubscriptions: this.desiredSubscriptions.size,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.desiredSubscriptions.size === 0) {
        debug("okx.ws", "Skipping websocket reconnect with no subscriptions.", {
          delayMs: RECONNECT_DELAY_MS,
        });
        return;
      }
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
