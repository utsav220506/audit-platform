const serverless = require("serverless-http");
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;

// ✅ SAME DB BUT SAFE FOR SERVERLESS
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

// ---------------- HELPERS ----------------

function uuid() {
  return crypto.randomUUID();
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Auth required" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
}

// ---------------- AUDIT ----------------

async function auditLog(action, userId, resourceId, resourceType, metadata = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs 
       (log_id, action, user_id, resource_id, resource_type, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuid(), action, userId, resourceId, resourceType, JSON.stringify(metadata)]
    );
  } catch (e) {
    console.error("Audit error:", e.message);
  }
}

// ---------------- ROUTES ----------------

// HEALTH
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// REGISTER
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role = "STUDENT" } = req.body;

    const hash = bcrypt.hashSync(password, 12);
    const id = uuid();

    await pool.query(
      `INSERT INTO users (user_id, name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, name, email, hash, role]
    );

    const token = jwt.sign({ userId: id, role }, JWT_SECRET);
    res.json({ token });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await pool.query(
    `SELECT * FROM users WHERE email=$1`,
    [email]
  );

  const user = rows[0];

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { userId: user.user_id, role: user.role },
    JWT_SECRET
  );

  res.json({ token });
});

// CREATE DOCUMENT
app.post("/api/documents", auth, async (req, res) => {
  const { title, content } = req.body;

  const docId = uuid();
  const versionId = uuid();

  await pool.query(
    `INSERT INTO documents VALUES ($1,$2,$3,NOW())`,
    [docId, title, req.user.userId]
  );

  await pool.query(
    `INSERT INTO document_versions 
     VALUES ($1,$2,$3,NOW(),$4,$5,$6)`,
    [
      versionId,
      docId,
      content,
      req.user.userId,
      sha256(content),
      1,
    ]
  );

  await auditLog("CREATE_DOC", req.user.userId, docId, "document");

  res.json({ docId });
});

// EDIT DOCUMENT
app.post("/api/documents/:id/edit", auth, async (req, res) => {
  const { content } = req.body;

  const { rows } = await pool.query(
    `SELECT MAX(version_number) as v 
     FROM document_versions WHERE document_id=$1`,
    [req.params.id]
  );

  const newVersion = (rows[0].v || 0) + 1;

  await pool.query(
    `INSERT INTO document_versions 
     VALUES ($1,$2,$3,NOW(),$4,$5,$6)`,
    [
      uuid(),
      req.params.id,
      content,
      req.user.userId,
      sha256(content),
      newVersion,
    ]
  );

  await auditLog("EDIT_DOC", req.user.userId, req.params.id, "document");

  res.json({ version: newVersion });
});

// VERSION HISTORY
app.get("/api/documents/:id/versions", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM document_versions WHERE document_id=$1`,
    [req.params.id]
  );

  res.json(rows);
});

// AUDIT LOGS
app.get(
  "/api/audit-logs",
  auth,
  requireRole("TEACHER", "HOD"),
  async (req, res) => {
    const { rows } = await pool.query(`SELECT * FROM audit_logs`);
    res.json(rows);
  }
);

// ---------------- EXPORT ----------------
module.exports = serverless(app);