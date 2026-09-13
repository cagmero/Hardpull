/* eslint-disable camelcase */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Replaces the previous in-process setTimeout retry chain, which couldn't survive a process
  // restart and only spanned ~1h instead of spec.md #6.8's 24h. A persisted queue plus a
  // periodically-run worker (src/scripts/deliver-webhooks.ts) can retry across restarts and for
  // the full window.
  pgm.createTable("webhook_deliveries", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    subscription_id: { type: "uuid", notNull: true, references: "webhook_subscriptions", onDelete: "CASCADE" },
    event: { type: "text", notNull: true },
    payload: { type: "jsonb", notNull: true },
    status: {
      type: "text",
      notNull: true,
      default: "PENDING",
      check: "status in ('PENDING','DELIVERED','FAILED')",
    },
    attempt_count: { type: "integer", notNull: true, default: 0 },
    next_attempt_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    last_error: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    delivered_at: { type: "timestamptz" },
  });
  pgm.createIndex("webhook_deliveries", ["status", "next_attempt_at"]);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("webhook_deliveries");
};
