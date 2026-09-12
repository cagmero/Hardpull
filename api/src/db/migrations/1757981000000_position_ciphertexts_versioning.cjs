/* eslint-disable camelcase */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // record_id must be reusable across versions (each status transition is a new append-only
  // row, mirroring ExposureCommitments onchain and FurnishedCommitment in the subgraph) -- it
  // can't stay the primary key. Give the table its own surrogate id instead.
  pgm.renameColumn("position_ciphertexts", "record_id", "record_id_old");
  pgm.dropConstraint("position_ciphertexts", "position_ciphertexts_pkey");
  pgm.addColumn("position_ciphertexts", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    record_id: { type: "text" },
  });
  pgm.sql("update position_ciphertexts set record_id = record_id_old::text");
  pgm.alterColumn("position_ciphertexts", "record_id", { notNull: true });
  pgm.dropColumn("position_ciphertexts", "record_id_old");
  pgm.createIndex("position_ciphertexts", "record_id");
  pgm.addConstraint("position_ciphertexts", "position_ciphertexts_record_version_unique", {
    unique: ["record_id", "version"],
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropConstraint("position_ciphertexts", "position_ciphertexts_record_version_unique");
  pgm.dropIndex("position_ciphertexts", "record_id");
  pgm.dropColumn("position_ciphertexts", "id");
  pgm.renameColumn("position_ciphertexts", "record_id", "record_id_old");
  pgm.addColumn("position_ciphertexts", {
    record_id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
  });
  pgm.dropColumn("position_ciphertexts", "record_id_old");
};
