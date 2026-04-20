import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runReplay } from "@/lib/replay/engine";
import { computeReplayMetrics } from "@/lib/replay/metrics";
import type { ReplaySnapshot } from "@/lib/replay/types";

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const inputFile = getArg("--file");
  const outputFile = getArg("--output");

  if (!inputFile) {
    throw new Error(
      "Usage: tsx src/scripts/replay.ts --file snapshots.json --output metrics.json",
    );
  }

  const raw = await readFile(path.resolve(inputFile), "utf8");
  const snapshots = JSON.parse(raw) as ReplaySnapshot[];
  const outcomes = await runReplay(snapshots);
  const metrics = computeReplayMetrics(outcomes);
  const payload = {
    metrics,
    outcomes,
  };

  if (outputFile) {
    await writeFile(
      path.resolve(outputFile),
      JSON.stringify(payload, null, 2),
      "utf8",
    );
    return;
  }

  console.log(JSON.stringify(payload, null, 2));
}

void main();
