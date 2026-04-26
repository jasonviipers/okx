-- Load sqlite-vss extension (loaded at runtime via better-sqlite3)
-- Create virtual VSS table mirroring swarm_memory
CREATE VIRTUAL TABLE IF NOT EXISTS swarm_memory_vss USING vss0(
  embedding(1536)
);
