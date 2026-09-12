/* eslint-disable camelcase */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns("furnishers", {
    client_id: { type: "text", unique: true },
    client_secret_hash: { type: "text" },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumns("furnishers", ["client_id", "client_secret_hash"]);
};
