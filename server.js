'use strict';

const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'audit-platform-secret-2024';
const PORT = process.env.PORT || 3001;

// ─── Database Setup ───────────────────────────────────────────────────────────
const db = new DatabaseSync(path.join(__dirname, 'audit_platform.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id       TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT CHECK(role IN ('STUDENT','TEACHER','HOD')) NOT NULL,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    document_id TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    created_by  TEXT NOT NULL REFERENCES users(user_id),
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS document_versions (
    version_id     TEXT PRIMARY KEY,
    document_id    TEXT NOT NULL REFERENCES documents(document_id),
    content        TEXT NOT NULL,
    timestamp      TEXT DEFAULT (datetime('now')),
    created_by     TEXT NOT NULL REFERENCES users(user_id),
    hash           TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    UNIQUE(document_id, version_number)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    log_id        TEXT PRIMARY KEY,
    action        TEXT CHECK(action IN (
                    'CREATE_DOC','EDIT_DOC','VIEW_DOC',
                    'GENERATE_REPORT','SHARE_DATA'
                  )) NOT NULL,
    user_id       TEXT NOT NULL,
    resource_id   TEXT,
    resource_type TEXT,
    timestamp     TEXT DEFAULT (datetime('now')),
    metadata      TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS reports (
    report_id    TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    generated_by TEXT NOT NULL REFERENCES users(user_id),
    timestamp    TEXT DEFAULT (datetime('now')),
    data         TEXT
  );

  CREATE TABLE IF NOT EXISTS share_logs (
    share_id    TEXT PRIMARY KEY,
    shared_by   TEXT NOT NULL,
    shared_to   TEXT,
    document_id TEXT NOT NULL,
    timestamp   TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: `Access denied. Required: ${roles.join(' or ')}` });
    next();
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uuid() { return crypto.randomUUID(); }
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

function auditLog(action, userId, resourceId, resourceType, metadata = {}) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (log_id, action, user_id, resource_id, resource_type, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuid(), action, userId, resourceId, resourceType, JSON.stringify(metadata));
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

function computeDiff(textA, textB) {
  const a = textA.split('\n');
  const b = textB.split('\n');
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) { result.unshift({ type: 'unchanged', line: a[i-1] }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { result.unshift({ type: 'added', line: b[j-1] }); j--; }
    else { result.unshift({ type: 'removed', line: a[i-1] }); i--; }
  }
  return result;
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/auth/register', (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role)
      return res.status(400).json({ error: 'All fields are required' });
    if (!['STUDENT', 'TEACHER', 'HOD'].includes(role))
      return res.status(400).json({ error: 'Invalid role' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const passwordHash = bcrypt.hashSync(password, 12);
    const userId = uuid();
    db.prepare(`INSERT INTO users (user_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`)
      .run(userId, name.trim(), email.toLowerCase().trim(), passwordHash, role);

    const token = jwt.sign({ userId, name, email, role }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ token, user: { userId, name, email, role } });
  } catch (e) {
    console.error('REGISTER ERROR:', e.message);
    if (e.message && e.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: e.message || 'Registration failed' });
  }
});

app.post('/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase().trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign(
      { userId: user.user_id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET, { expiresIn: '24h' }
    );
    res.json({ token, user: { userId: user.user_id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    console.error('LOGIN ERROR:', e.message);
    res.status(500).json({ error: e.message || 'Login failed' });
  }
});

// ─── Documents ────────────────────────────────────────────────────────────────
app.post('/documents', auth, (req, res) => {
  try {
    if (req.user.role === 'HOD') return res.status(403).json({ error: 'HOD cannot create documents' });
    const { title, content } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
    if (content === undefined) return res.status(400).json({ error: 'Content is required' });

    const docId = uuid(), verId = uuid(), hash = sha256(content);
    db.exec('BEGIN');
    try {
      db.prepare(`INSERT INTO documents (document_id, title, created_by) VALUES (?, ?, ?)`)
        .run(docId, title.trim(), req.user.userId);
      db.prepare(`INSERT INTO document_versions (version_id, document_id, content, created_by, hash, version_number) VALUES (?, ?, ?, ?, ?, 1)`)
        .run(verId, docId, content, req.user.userId, hash);
      auditLog('CREATE_DOC', req.user.userId, docId, 'document', { title });
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    res.status(201).json({ documentId: docId, versionId: verId, versionNumber: 1, hash });
  } catch (e) {
    console.error('CREATE DOC ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/documents', auth, (req, res) => {
  try {
    let rows;
    if (req.user.role === 'STUDENT') {
      rows = db.prepare(`
        SELECT d.*, u.name AS author,
          (SELECT version_number FROM document_versions WHERE document_id = d.document_id ORDER BY version_number DESC LIMIT 1) AS latest_version,
          (SELECT timestamp FROM document_versions WHERE document_id = d.document_id ORDER BY version_number DESC LIMIT 1) AS last_modified
        FROM documents d JOIN users u ON d.created_by = u.user_id
        WHERE d.created_by = ? ORDER BY d.created_at DESC
      `).all(req.user.userId);
    } else {
      rows = db.prepare(`
        SELECT d.*, u.name AS author,
          (SELECT version_number FROM document_versions WHERE document_id = d.document_id ORDER BY version_number DESC LIMIT 1) AS latest_version,
          (SELECT timestamp FROM document_versions WHERE document_id = d.document_id ORDER BY version_number DESC LIMIT 1) AS last_modified
        FROM documents d JOIN users u ON d.created_by = u.user_id
        ORDER BY d.created_at DESC
      `).all();
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/documents/:id', auth, (req, res) => {
  try {
    const doc = db.prepare(`SELECT d.*, u.name AS author FROM documents d JOIN users u ON d.created_by = u.user_id WHERE d.document_id = ?`).get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (req.user.role === 'STUDENT' && doc.created_by !== req.user.userId)
      return res.status(403).json({ error: 'Access denied' });
    const latest = db.prepare(`SELECT dv.*, u.name AS editor FROM document_versions dv JOIN users u ON dv.created_by = u.user_id WHERE dv.document_id = ? ORDER BY dv.version_number DESC LIMIT 1`).get(req.params.id);
    auditLog('VIEW_DOC', req.user.userId, req.params.id, 'document');
    res.json({ ...doc, latestVersion: latest });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/documents/:id/edit', auth, (req, res) => {
  try {
    if (req.user.role === 'HOD') return res.status(403).json({ error: 'HOD cannot edit documents' });
    const doc = db.prepare(`SELECT * FROM documents WHERE document_id = ?`).get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (req.user.role === 'STUDENT' && doc.created_by !== req.user.userId)
      return res.status(403).json({ error: 'Students can only edit their own documents' });
    const { content } = req.body;
    if (content === undefined) return res.status(400).json({ error: 'Content is required' });
    const latest = db.prepare(`SELECT version_number FROM document_versions WHERE document_id = ? ORDER BY version_number DESC LIMIT 1`).get(req.params.id);
    const newVersion = (latest ? latest.version_number : 0) + 1;
    const verId = uuid(), hash = sha256(content);
    db.exec('BEGIN');
    try {
      db.prepare(`INSERT INTO document_versions (version_id, document_id, content, created_by, hash, version_number) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(verId, req.params.id, content, req.user.userId, hash, newVersion);
      auditLog('EDIT_DOC', req.user.userId, req.params.id, 'document', { version: newVersion, hash });
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    res.json({ versionId: verId, versionNumber: newVersion, hash });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/documents/:id/versions', auth, (req, res) => {
  try {
    const doc = db.prepare(`SELECT * FROM documents WHERE document_id = ?`).get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (req.user.role === 'STUDENT' && doc.created_by !== req.user.userId)
      return res.status(403).json({ error: 'Access denied' });
    const versions = db.prepare(`SELECT dv.*, u.name AS editor FROM document_versions dv JOIN users u ON dv.created_by = u.user_id WHERE dv.document_id = ? ORDER BY dv.version_number DESC`).all(req.params.id);
    res.json(versions);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/documents/:id/compare', auth, (req, res) => {
  try {
    const { v1, v2 } = req.query;
    if (!v1 || !v2) return res.status(400).json({ error: 'v1 and v2 required' });
    const doc = db.prepare(`SELECT * FROM documents WHERE document_id = ?`).get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (req.user.role === 'STUDENT' && doc.created_by !== req.user.userId)
      return res.status(403).json({ error: 'Access denied' });
    const verA = db.prepare(`SELECT * FROM document_versions WHERE document_id = ? AND version_number = ?`).get(req.params.id, Number(v1));
    const verB = db.prepare(`SELECT * FROM document_versions WHERE document_id = ? AND version_number = ?`).get(req.params.id, Number(v2));
    if (!verA) return res.status(404).json({ error: `Version ${v1} not found` });
    if (!verB) return res.status(404).json({ error: `Version ${v2} not found` });
    const diff = computeDiff(verA.content, verB.content);
    const added = diff.filter(d => d.type === 'added').length;
    const removed = diff.filter(d => d.type === 'removed').length;
    res.json({ versionA: verA, versionB: verB, diff, stats: { added, removed, unchanged: diff.length - added - removed } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Reports ──────────────────────────────────────────────────────────────────
app.post('/reports/generate', auth, requireRole('TEACHER', 'HOD'), (req, res) => {
  try {
    const { type = 'FULL' } = req.body;
    const users = db.prepare(`SELECT user_id, name, email, role, created_at FROM users`).all();
    const docs = db.prepare(`SELECT d.*, u.name AS author FROM documents d JOIN users u ON d.created_by = u.user_id`).all();
    const enriched = docs.map(doc => {
      const versions = db.prepare(`SELECT dv.version_number, dv.timestamp, dv.hash, u.name AS editor FROM document_versions dv JOIN users u ON dv.created_by = u.user_id WHERE dv.document_id = ? ORDER BY dv.version_number ASC`).all(doc.document_id);
      return { ...doc, versionCount: versions.length, versions };
    });
    const auditSummary = db.prepare(`SELECT action, COUNT(*) as count FROM audit_logs GROUP BY action`).all();
    const reportId = uuid();
    const reportData = { type, generatedAt: new Date().toISOString(), generatedBy: req.user.name, summary: { totalUsers: users.length, totalDocuments: docs.length, auditSummary }, users, documents: enriched };
    db.prepare(`INSERT INTO reports (report_id, type, generated_by, data) VALUES (?, ?, ?, ?)`)
      .run(reportId, type, req.user.userId, JSON.stringify(reportData));
    auditLog('GENERATE_REPORT', req.user.userId, reportId, 'report', { type });
    res.status(201).json({ reportId, ...reportData });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/reports', auth, requireRole('TEACHER', 'HOD'), (req, res) => {
  try {
    const reports = db.prepare(`SELECT r.report_id, r.type, r.timestamp, u.name AS generatedBy FROM reports r JOIN users u ON r.generated_by = u.user_id ORDER BY r.timestamp DESC`).all();
    res.json(reports);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/reports/:id', auth, requireRole('TEACHER', 'HOD'), (req, res) => {
  try {
    const report = db.prepare(`SELECT * FROM reports WHERE report_id = ?`).get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json({ ...report, data: JSON.parse(report.data) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Share ────────────────────────────────────────────────────────────────────
app.post('/share', auth, requireRole('TEACHER', 'HOD'), (req, res) => {
  try {
    const { documentId, sharedTo } = req.body;
    if (!documentId) return res.status(400).json({ error: 'documentId required' });
    const doc = db.prepare(`SELECT * FROM documents WHERE document_id = ?`).get(documentId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const shareId = uuid();
    db.prepare(`INSERT INTO share_logs (share_id, shared_by, shared_to, document_id) VALUES (?, ?, ?, ?)`)
      .run(shareId, req.user.userId, sharedTo || null, documentId);
    auditLog('SHARE_DATA', req.user.userId, documentId, 'document', { sharedTo });
    res.status(201).json({ shareId, message: 'Document shared successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Audit Logs ───────────────────────────────────────────────────────────────
app.get('/audit-logs', auth, requireRole('TEACHER', 'HOD'), (req, res) => {
  try {
    const { limit = 200, action, userId } = req.query;
    let query = `SELECT al.*, u.name AS userName, u.role AS userRole FROM audit_logs al JOIN users u ON al.user_id = u.user_id WHERE 1=1`;
    const params = [];
    if (action) { query += ` AND al.action = ?`; params.push(action); }
    if (userId) { query += ` AND al.user_id = ?`; params.push(userId); }
    query += ` ORDER BY al.timestamp DESC LIMIT ?`;
    params.push(Number(limit));
    const logs = db.prepare(query).all(...params);
    res.json(logs.map(l => ({ ...l, metadata: JSON.parse(l.metadata || '{}') })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Users ────────────────────────────────────────────────────────────────────
app.get('/users', auth, requireRole('TEACHER', 'HOD'), (req, res) => {
  try {
    res.json(db.prepare(`SELECT user_id, name, email, role FROM users ORDER BY name`).all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('UNHANDLED ERROR:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🔒 Audit-First Document Platform`);
  console.log(`   Server: http://localhost:${PORT}`);
  try { db.prepare('SELECT 1').get(); console.log(`   Database: OK ✓\n`); }
  catch (e) { console.error(`   Database ERROR: ${e.message}\n`); }
});
