/* eslint-disable camelcase */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable("subjects", {
    subject_id: { type: "text", primaryKey: true },
    first_seen_at: { type: "timestamptz", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createTable("wallets", {
    wallet: { type: "text", primaryKey: true },
    subject_id: { type: "text", notNull: true, references: "subjects", onDelete: "CASCADE" },
    bound_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("wallets", "subject_id");

  pgm.createTable("furnishers", {
    furnisher_id: { type: "text", primaryKey: true },
    ens_name: { type: "text" },
    public_key_hex: { type: "text", notNull: true },
    operator_address: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "ACTIVE", check: "status in ('ACTIVE','SUSPENDED')" },
    registered_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createTable("position_ciphertexts", {
    record_id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    subject_id: { type: "text", notNull: true, references: "subjects" },
    furnisher_id: { type: "text", notNull: true, references: "furnishers" },
    ciphertext: { type: "bytea", notNull: true },
    commitment: { type: "text", notNull: true },
    version: { type: "integer", notNull: true, default: 1 },
    status: {
      type: "text",
      notNull: true,
      default: "ACTIVE",
      check: "status in ('ACTIVE','REPAID','DEFAULTED','CLOSED')",
    },
    tx_hash: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("position_ciphertexts", "subject_id");
  pgm.createIndex("position_ciphertexts", "furnisher_id");

  pgm.createTable("consent_grants", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    subject_id: { type: "text", notNull: true, references: "subjects" },
    puller_id: { type: "text", notNull: true, references: "furnishers" },
    expires_at: { type: "timestamptz", notNull: true },
    max_pulls: { type: "integer", notNull: true },
    pulls_used: { type: "integer", notNull: true, default: 0 },
    purpose: { type: "text" },
    revoked_at: { type: "timestamptz" },
    tx_hash: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("consent_grants", ["subject_id", "puller_id"]);

  pgm.createTable("inquiries", {
    inquiry_id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    subject_id: { type: "text", notNull: true, references: "subjects" },
    puller_id: { type: "text", notNull: true, references: "furnishers" },
    puller_hash: { type: "text", notNull: true },
    verdict: { type: "text", notNull: true, check: "verdict in ('CLEAR','WARNING','CRITICAL','INSUFFICIENT_DATA')" },
    exposure_bucket: { type: "text", notNull: true },
    stacking_flags: { type: "text[]", notNull: true, default: "{}" },
    attestation: { type: "text", notNull: true },
    hcs_sequence_number: { type: "bigint" },
    occurred_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("inquiries", "subject_id");
  pgm.createIndex("inquiries", "occurred_at");

  pgm.createTable("webhook_subscriptions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    furnisher_id: { type: "text", notNull: true, references: "furnishers" },
    url: { type: "text", notNull: true },
    events: { type: "text[]", notNull: true },
    secret: { type: "text", notNull: true },
    active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // Idempotency is served hot out of Redis (docs/spec.md #6, T-052); this table is the durable
  // mirror the reconciliation job and audits read from, not the request-path lookup.
  pgm.createTable("idempotency_keys", {
    key: { type: "text", primaryKey: true },
    response_status: { type: "integer", notNull: true },
    response_body: { type: "jsonb", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    expires_at: { type: "timestamptz", notNull: true },
  });
  pgm.createIndex("idempotency_keys", "expires_at");
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("idempotency_keys");
  pgm.dropTable("webhook_subscriptions");
  pgm.dropTable("inquiries");
  pgm.dropTable("consent_grants");
  pgm.dropTable("position_ciphertexts");
  pgm.dropTable("furnishers");
  pgm.dropTable("wallets");
  pgm.dropTable("subjects");
};
