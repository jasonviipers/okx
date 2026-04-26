import "server-only";

import { env } from "@/env";
import { parseBoolean, parseNumber } from "@/lib/runtime-utils";
import type { OpenPositionRecord } from "@/lib/store/open-positions";
import { SWARM_POLICY } from "@/lib/swarm/policy";
import { SWARM_THRESHOLDS } from "@/lib/swarm/thresholds";

export function isTrailingStopEnabled(): boolean {
  return parseBoolean(env.TRAILING_STOP_ENABLED, true);
}

export function getTrailingStopDistancePct(): number {
  const policyDefault =
    SWARM_POLICY.exits.trailingActivationGainPct *
    SWARM_POLICY.exits.trailingGainLockRatio *
    100;
  return Math.max(
    0.1,
    parseNumber(
      env.TRAILING_STOP_DISTANCE_PCT,
      Math.max(
        policyDefault,
        SWARM_THRESHOLDS.DEFAULT_TRAILING_STOP_DISTANCE_PCT,
      ),
    ),
  );
}

export function computeTrailingStopPrice(
  direction: OpenPositionRecord["direction"],
  referencePrice: number,
  distancePct = getTrailingStopDistancePct(),
): number {
  const distanceRatio = distancePct / 100;

  return direction === "BUY"
    ? Number((referencePrice * (1 - distanceRatio)).toFixed(8))
    : Number((referencePrice * (1 + distanceRatio)).toFixed(8));
}

export function activateTrailingStop(
  position: OpenPositionRecord,
  referencePrice: number,
): OpenPositionRecord {
  if (!isTrailingStopEnabled()) {
    return position;
  }

  const trailingStopDistancePct = position.trailingStopDistancePct;
  return {
    ...position,
    trailingStopActive: true,
    trailingStopAnchorPrice: referencePrice,
    trailingStopPrice: computeTrailingStopPrice(
      position.direction,
      referencePrice,
      trailingStopDistancePct,
    ),
  };
}

export function updateTrailingStop(
  position: OpenPositionRecord,
  currentPrice: number,
): OpenPositionRecord {
  if (
    !position.trailingStopActive ||
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0
  ) {
    return position;
  }

  const previousAnchor =
    position.trailingStopAnchorPrice ?? position.entryPrice ?? currentPrice;
  const shouldTighten =
    position.direction === "BUY"
      ? currentPrice > previousAnchor
      : currentPrice < previousAnchor;

  if (!shouldTighten) {
    return position;
  }

  const nextStop = computeTrailingStopPrice(
    position.direction,
    currentPrice,
    position.trailingStopDistancePct,
  );
  const tightenedStop =
    position.direction === "BUY"
      ? Math.max(
          position.trailingStopPrice ?? Number.NEGATIVE_INFINITY,
          nextStop,
        )
      : Math.min(
          position.trailingStopPrice ?? Number.POSITIVE_INFINITY,
          nextStop,
        );

  return {
    ...position,
    trailingStopAnchorPrice: currentPrice,
    trailingStopPrice: Number(tightenedStop.toFixed(8)),
  };
}

export function hasTrailingStopBeenHit(
  position: OpenPositionRecord,
  currentPrice: number,
): boolean {
  if (
    !position.trailingStopActive ||
    position.trailingStopPrice === null ||
    !Number.isFinite(currentPrice)
  ) {
    return false;
  }

  return position.direction === "BUY"
    ? currentPrice <= position.trailingStopPrice
    : currentPrice >= position.trailingStopPrice;
}
