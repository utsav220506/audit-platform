const serverless = require("serverless-http");
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "audit-platform-secret-2024";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 1, // VERY IMPORTANT for serverless
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

let isInitialized = false;

async function initDB() {
  if (isInitialized) return;

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS documents (
        document_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS document_versions (
        version_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        created_by TEXT NOT NULL,
        hash TEXT NOT NULL,
        version_number INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        log_id TEXT PRIMARY KEY,
        action TEXT,
        user_id TEXT,
        resource_id TEXT,
        resource_type TEXT,
        timestamp TIMESTAMP DEFAULT NOW(),
        metadata TEXT DEFAULT '{}'
      );
    `);

    isInitialized = true;
  } finally {
    client.release();
  }
}

app.use(cors());
app.use(express.json());

// helpers
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

async function auditLog(action, userId, resourceId, resourceType) {
  try {
    await pool.query(
      `INSERT INTO audit_logs VALUES ($1,$2,$3,$4,$5,NOW(),'{}')`,
      [uuid(), action, userId, resourceId, resourceType]
    );
  } catch {}
}

// ---------------- ROUTES ----------------

// health
app.get(["/api/health", "/health"], (req, res) => {
  res.json({ ok: true });
});

// register
app.post(["/api/auth/register", "/auth/register"], async (req, res) => {
  try {
    const { name, email, password, role = "STUDENT" } = req.body;

    const hash = bcrypt.hashSync(password, 12);
    const id = uuid();

    await pool.query(
      `INSERT INTO users VALUES ($1,$2,$3,$4,$5,NOW())`,
      [id, name, email, hash, role]
    );

    const token = jwt.sign({ userId: id, name, email, role }, JWT_SECRET);

    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// login
app.post(["/api/auth/login", "/auth/login"], async (req, res) => {
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
    {
      userId: user.user_id,
      name: user.name,
      role: user.role,
    },
    JWT_SECRET
  );

  res.json({ token });
});

// create document
app.post(["/api/documents", "/documents"], auth, async (req, res) => {
  const { title, content } = req.body;

  const docId = uuid();
  const verId = uuid();

  await pool.query(
    `INSERT INTO documents VALUES ($1,$2,$3,NOW())`,
    [docId, title, req.user.userId]
  );

  await pool.query(
    `INSERT INTO document_versions VALUES ($1,$2,$3,NOW(),$4,$5,1)`,
    [verId, docId, content, req.user.userId, sha256(content)]
  );

  await auditLog("CREATE_DOC", req.user.userId, docId, "document");

  res.json({ docId });
});

// get documents
app.get(["/api/documents", "/documents"], auth, async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM documents`);
  res.json(rows);
});

// edit document
app.post(
  ["/api/documents/:id/edit", "/documents/:id/edit"],
  auth,
  async (req, res) => {
    const { content } = req.body;

    const { rows } = await pool.query(
      `SELECT MAX(version_number) as v FROM document_versions WHERE document_id=$1`,
      [req.params.id]
    );

    const newVersion = (rows[0].v || 0) + 1;

    await pool.query(
      `INSERT INTO document_versions VALUES ($1,$2,$3,NOW(),$4,$5,$6)`,
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
  }
);

// audit logs
app.get(
  ["/api/audit-logs", "/audit-logs"],
  auth,
  async (req, res) => {
    const { rows } = await pool.query(`SELECT * FROM audit_logs`);
    res.json(rows);
  }
);

// ---------- EXPORT ----------
module.exports = async (req, res) => {
  await initDB();
  return serverless(app)(req, res);
};