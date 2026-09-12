/* eslint-disable camelcase */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Distinct from client_secret_hash: OAuth2 client_secret is one-way hashed (we only ever
  // verify a claim), but HMAC request signing requires the server to recompute the signature,
  // so this one is stored retrievable -- same trust model as a Stripe webhook signing secret.
  pgm.addColumn("furnishers", {
    hmac_secret: { type: "text" },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumn("furnishers", "hmac_secret");
};
