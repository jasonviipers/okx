import Link from "next/link";
import { getRecentMemories } from "@/lib/memory/aging-memory";
import { getMemoryDbPath } from "@/lib/memory/sqlite";

export const dynamic = "force-dynamic";

function fmtDate(value: string) {
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MemoryPage() {
  const memories = await getRecentMemories(undefined, undefined, 100);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Aging Memory Review
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              SQLite-backed swarm memory with recency decay and recall scoring.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Store: <code>{getMemoryDbPath()}</code>
            </p>
          </div>
          <Link
            href="/"
            className="rounded border border-border px-3 py-2 text-sm hover:border-primary hover:text-primary"
          >
            Back To Dashboard
          </Link>
        </div>

        <div className="rounded border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">
            Recent Memory Records ({memories.length})
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Symbol</th>
                  <th className="px-4 py-2">TF</th>
                  <th className="px-4 py-2">Signal</th>
                  <th className="px-4 py-2">Conf</th>
                  <th className="px-4 py-2">Agree</th>
                  <th className="px-4 py-2">Blocked</th>
                  <th className="px-4 py-2">Spread</th>
                  <th className="px-4 py-2">Vol</th>
                  <th className="px-4 py-2">Summary</th>
                </tr>
              </thead>
              <tbody>
                {memories.map((memory) => (
                  <tr
                    key={memory.id}
                    className="border-b border-border/60 align-top"
                  >
                    <td className="px-4 py-2 text-muted-foreground">
                      {fmtDate(memory.createdAt)}
                    </td>
                    <td className="px-4 py-2 font-medium">{memory.symbol}</td>
                    <td className="px-4 py-2">{memory.timeframe}</td>
                    <td className="px-4 py-2">{memory.signal}</td>
                    <td className="px-4 py-2">
                      {(memory.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2">
                      {(memory.agreement * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2">
                      {memory.blocked ? (memory.blockReason ?? "YES") : "NO"}
                    </td>
                    <td className="px-4 py-2">
                      {memory.spreadBps.toFixed(1)} bps
                    </td>
                    <td className="px-4 py-2">
                      {memory.volatilityPct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {memory.summary}
                    </td>
                  </tr>
                ))}
                {memories.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No memories stored yet. Run the swarm a few times and come
                      back here to review what it retained.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
