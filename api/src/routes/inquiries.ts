import { Hono } from "hono";
import { pool } from "../db/pool.js";

export const inquiries = new Hono();

// GET /v1/subjects/{id}/inquiries -- borrower-visible inquiry history (docs/plan.md T-058).
// Puller identity is hashed for third parties but this route is the subject viewing their own
// file, so we could show more -- kept hashed here too since the API doesn't reverse the hash
// (only Postgres's furnishers table can map puller_hash back to an id, and this route
// deliberately doesn't join it, matching disclosure limits by construction, not discipline).
inquiries.get("/subjects/:subjectId/inquiries", async (c) => {
  const subjectId = c.req.param("subjectId");
  const result = await pool.query(
    `select inquiry_id, puller_hash, verdict, exposure_bucket, occurred_at
     from inquiries where subject_id = $1 order by occurred_at desc limit 100`,
    [subjectId],
  );
  return c.json({ subjectId, inquiries: result.rows });
});

// GET /v1/pull/{inquiryId} -- verdict retrieval with attestation (docs/plan.md T-058).
inquiries.get("/pull/:inquiryId", async (c) => {
  const result = await pool.query(
    `select inquiry_id, subject_id, verdict, exposure_bucket, stacking_flags, attestation, occurred_at
     from inquiries where inquiry_id = $1`,
    [c.req.param("inquiryId")],
  );
  const row = result.rows[0];
  if (!row) {
    return c.json({ error: "INQUIRY_NOT_FOUND", message: "No inquiry with this id" }, 404);
  }
  return c.json(row);
});
