import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { StoredAutonomyState } from "@/lib/persistence/autonomy-state";

export const autonomyState = pgTable("autonomy_state", {
  id: text("id").primaryKey(),
  state: jsonb("state").$type<StoredAutonomyState>().notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "string",
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});
