import { sqlite, vectorSearchEnabled } from "@/db";

let vectorSearchUnavailable = !vectorSearchEnabled;

function getVectorErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function markVectorSearchUnavailable(error: unknown) {
  if (!vectorSearchUnavailable) {
    vectorSearchUnavailable = true;
    console.warn(
      `[Vector] sqlite-vss unavailable; vector operations disabled. ${getVectorErrorMessage(error)}`,
    );
  }
}

/**
 * Insert a vector embedding for a swarm_memory row.
 * Call after every INSERT into swarm_memory.
 */
export async function insertVector(rowid: number, embedding: number[]) {
  if (vectorSearchUnavailable) {
    return false;
  }

  try {
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO swarm_memory_vss(rowid, embedding) VALUES (?, ?)`,
      )
      .run(rowid, JSON.stringify(embedding));
    return true;
  } catch (error) {
    markVectorSearchUnavailable(error);
    return false;
  }
}

/**
 * Find top-k most similar memories to a query vector.
 */
export async function searchMemory(
  queryEmbedding: number[],
  k = 10,
): Promise<{ rowid: number; distance: number }[]> {
  if (vectorSearchUnavailable) {
    return [];
  }

  try {
    return sqlite
      .prepare(
        `SELECT rowid, distance
         FROM swarm_memory_vss
         WHERE vss_search(embedding, ?)
         LIMIT ?`,
      )
      .all(JSON.stringify(queryEmbedding), k) as Array<{
      rowid: number;
      distance: number;
    }>;
  } catch (error) {
    markVectorSearchUnavailable(error);
    return [];
  }
}
