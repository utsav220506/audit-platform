const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'audit-platform-secret-2024';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });
    next();
  };
}

function uuid() { return crypto.randomUUID(); }
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

async function auditLog(action, userId, resourceId, resourceType, metadata = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (log_id,action,user_id,resource_id,resource_type,metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuid(), action, userId, resourceId, resourceType, JSON.stringify(metadata)]
    );
  } catch(e) { console.error('Audit error:', e.message); }
}

function computeDiff(textA, textB) {
  const a = textA.split('\n'), b = textB.split('\n');
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1},()=>new Array(n+1).fill(0));
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);
  const result=[]; let i=m,j=n;
  while(i>0||j>0){
    if(i>0&&j>0&&a[i-1]===b[j-1]){result.unshift({type:'unchanged',line:a[i-1]});i--;j--;}
    else if(j>0&&(i===0||dp[i][j-1]>=dp[i-1][j])){result.unshift({type:'added',line:b[j-1]});j--;}
    else{result.unshift({type:'removed',line:a[i-1]});i--;}
  }
  return result;
}

const apiRouter = express.Router();

apiRouter.get('/health', (req, res) => res.json({ ok: true }));

apiRouter.post('/auth/register', async (req, res) => {
  console.log('-> [REGISTRY] API path hit!');
  try {
    const { name, email, password, role } = req.body;
    console.log('-> [REGISTRY] Form parsed for:', email, 'Role:', role);
    
    if (!name||!email||!password||!role) return res.status(400).json({ error: 'All fields are required' });
    if (!['STUDENT','TEACHER','HOD'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    
    console.log('-> [REGISTRY] Hashing password...');
    const passwordHash = bcrypt.hashSync(password, 12);
    const userId = uuid();
    
    console.log(`-> [REGISTRY] Establishing DB Connection to insert user... (DB URL provided: ${!!process.env.DATABASE_URL})`);
    
    // Explicit 8-second circuit breaker for hanging pools
    const queryPromise = pool.query(
      `INSERT INTO users (user_id,name,email,password_hash,role) VALUES ($1,$2,$3,$4,$5)`,
      [userId, name.trim(), email.toLowerCase().trim(), passwordHash, role]
    );

    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('DATABASE_CONNECTION_TIMEOUT: Query hung for over 8 seconds.')), 8000));
    
    await Promise.race([queryPromise, timeoutPromise]);
    
    console.log('-> [REGISTRY] DB Insertion Success!');
    const token = jwt.sign({ userId, name, email, role }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ token, user: { userId, name, email, role } });
  } catch(e) {
    console.error('-> [REGISTRY ERROR]:', e.message);
    if(e.message.includes('unique')||e.message.includes('duplicate'))
      return res.status(409).json({ error: 'Email already registered' });
    if(e.message.includes('relation "users" does not exist'))
      return res.status(500).json({ error: 'CRITICAL: The users table was NOT found in Supabase! Ensure setup queries ran successfully.' });
    if(e.message.includes('DATABASE_CONNECTION_TIMEOUT'))
      return res.status(504).json({ error: 'CRITICAL: Vercel hung waiting for Supabase. Check if your Vercel Environment Variables are actively deployed.' });
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email||!password) return res.status(400).json({ error: 'Email and password required' });
    const { rows } = await pool.query(`SELECT * FROM users WHERE email=$1`, [email.toLowerCase().trim()]);
    const user = rows[0];
    if (!user||!bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign(
      { userId:user.user_id, name:user.name, email:user.email, role:user.role },
      JWT_SECRET, { expiresIn:'24h' }
    );
    res.json({ token, user:{ userId:user.user_id, name:user.name, email:user.email, role:user.role } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

apiRouter.post('/documents', auth, async (req, res) => {
  try {
    if (req.user.role==='HOD') return res.status(403).json({ error: 'HOD cannot create documents' });
    const { title, content } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (content===undefined) return res.status(400).json({ error: 'Content is required' });
    const docId=uuid(), verId=uuid(), hash=sha256(content);
    // Directly insert without transaction to avoid connection holding in serverless
    await pool.query(`INSERT INTO documents(document_id,title,created_by) VALUES($1,$2,$3)`, [docId,title.trim(),req.user.userId]);
    await pool.query(`INSERT INTO document_versions(version_id,document_id,content,created_by,hash,version_number) VALUES($1,$2,$3,$4,$5,1)`, [verId,docId,content,req.user.userId,hash]);
    await auditLog('CREATE_DOC', req.user.userId, docId, 'document', { title });
    res.status(201).json({ documentId:docId, versionId:verId, versionNumber:1, hash });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

apiRouter.get('/documents', auth, async (req, res) => {
  try {
    let query, params=[];
    const sub = `(SELECT version_number FROM document_versions WHERE document_id=d.document_id ORDER BY version_number DESC LIMIT 1) AS latest_version,
                 (SELECT timestamp FROM document_versions WHERE document_id=d.document_id ORDER BY version_number DESC LIMIT 1) AS last_modified`;
    if (req.user.role==='STUDENT') {
      query=`SELECT d.*,u.name AS author,${sub} FROM documents d JOIN users u ON d.created_by=u.user_id WHERE d.created_by=$1 ORDER BY d.created_at DESC`;
      params=[req.user.userId];
    } else {
      query=`SELECT d.*,u.name AS author,${sub} FROM documents d JOIN users u ON d.created_by=u.user_id ORDER BY d.created_at DESC`;
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

apiRouter.get('/documents/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT d.*,u.name AS author FROM documents d JOIN users u ON d.created_by=u.user_id WHERE d.document_id=$1`, [req.params.id]);
    const doc=rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (req.user.role==='STUDENT'&&doc.created_by!==req.user.userId) return res.status(403).json({ error: 'Access denied' });
    const { rows:vRows } = await pool.query(`SELECT dv.*,u.name AS editor FROM document_versions dv JOIN users u ON dv.created_by=u.user_id WHERE dv.document_id=$1 ORDER BY dv.version_number DESC LIMIT 1`, [req.params.id]);
    await auditLog('VIEW_DOC', req.user.userId, req.params.id, 'document');
    res.json({ ...doc, latestVersion:vRows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

apiRouter.post('/documents/:id/edit', auth, async (req, res) => {
  try {
    if (req.user.role==='HOD') return res.status(403).json({ error: 'HOD cannot edit documents' });
    const { rows } = await pool.query(`SELECT * FROM documents WHERE document_id=$1`, [req.params.id]);
    const doc=rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (req.user.role==='STUDENT'&&doc.created_by!==req.user.userId) return res.status(403).json({ error: 'Students can only edit their own documents' });
    const { content } = req.body;
    if (content===undefined) return res.status(400).json({ error: 'Content is required' });
    const { rows:vRows } = await pool.query(`SELECT version_number FROM document_versions WHERE document_id=$1 ORDER BY version_number DESC LIMIT 1`, [req.params.id]);
    const newVersion=(vRows[0]?vRows[0].version_number:0)+1;
    const verId=uuid(), hash=sha256(content);
    await pool.query(`INSERT INTO document_versions(version_id,document_id,content,created_by,hash,version_number) VALUES($1,$2,$3,$4,$5,$6)`, [verId,req.params.id,content,req.user.userId,hash,newVersion]);
    await auditLog('EDIT_DOC', req.user.userId, req.params.id, 'document', { version:newVersion, hash });
    res.json({ versionId:verId, versionNumber:newVersion, hash });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

apiRouter.get('/documents/:id/versions', auth, async (req, res) => {
  try {
    const { rows:dRows } = await pool.query(`SELECT * FROM documents WHERE document_id=$1`, [req.params.id]);
    if (!dRows[0]) return res.status(404).json({ error: 'Document not found' });
    if (req.user.role==='STUDENT'&&dRows[0].created_by!==req.user.userId) return res.status(403).json({ error: 'Access denied' });
    const { rows } = await pool.query(`SELECT dv.*,u.name AS editor FROM document_versions dv JOIN users u ON dv.created_by=u.user_id WHERE dv.document_id=$1 ORDER BY dv.version_number DESC`, [req.params.id]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

apiRouter.get('/documents/:id/compare', auth, async (req, res) => {
  try {
    const { v1, v2 } = req.query;
    if (!v1||!v2) return res.status(400).json({ error: 'v1 and v2 required' });
    const { rows:dRows } = await pool.query(`SELECT * FROM documents WHERE document_id=$1`, [req.params.id]);
    if (!dRows[0]) return res.status(404).json({ error: 'Document not found' });
    if (req.user.role==='STUDENT'&&dRows[0].created_by!==req.user.userId) return res.status(403).json({ error: 'Access denied' });
    const { rows:aRows } = await pool.query(`SELECT * FROM document_versions WHERE document_id=$1 AND version_number=$2`, [req.params.id,Number(v1)]);
    const { rows:bRows } = await pool.query(`SELECT * FROM document_versions WHERE document_id=$1 AND version_number=$2`, [req.params.id,Number(v2)]);
    if (!aRows[0]) return res.status(404).json({ error: `Version ${v1} not found` });
    if (!bRows[0]) return res.status(404).json({ error: `Version ${v2} not found` });
    const diff=computeDiff(aRows[0].content,bRows[0].content);
    const added=diff.filter(d=>d.type==='added').length;
    const removed=diff.filter(d=>d.type==='removed').length;
    res.json({ versionA:aRows[0], versionB:bRows[0], diff, stats:{ added, removed, unchanged:diff.length-added-removed } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

apiRouter.post('/reports/generate', auth, requireRole('TEACHER','HOD'), async (req, res) => {
  try {
    const { type='FULL' } = req.body;
    const { rows:users } = await pool.query(`SELECT user_id,name,email,role,created_at FROM users`);
    const { rows:docs } = await pool.query(`SELECT d.*,u.name AS author FROM documents d JOIN users u ON d.created_by=u.user_id`);
    const enriched = await Promise.all(docs.map(async doc => {
      const { rows:versions } = await pool.query(`SELECT dv.version_number,dv.timestamp,dv.hash,u.name AS editor FROM document_versions dv JOIN users u ON dv.created_by=u.user_id WHERE dv.document_id=$1 ORDER BY dv.version_number ASC`, [doc.document_id]);
      return { ...doc, versionCount:versions.length, versions };
    }));
    const { rows:auditSummary } = await pool.query(`SELECT action,COUNT(*) as count FROM audit_logs GROUP BY action`);
    const reportId=uuid();
    const reportData={ type, generatedAt:new Date().toISOString(), generatedBy:req.user.name, summary:{ totalUsers:users.length, totalDocuments:docs.length, auditSummary }, users, documents:enriched };
    await pool.query(`INSERT INTO reports(report_id,type,generated_by,data) VALUES($1,$2,$3,$4)`, [reportId,type,req.user.userId,JSON.stringify(reportData)]);
    await auditLog('GENERATE_REPORT', req.user.userId, reportId, 'report', { type });
    res.status(201).json({ reportId, ...reportData });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

apiRouter.get('/reports', auth, requireRole('TEACHER','HOD'), async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT r.report_id,r.type,r.timestamp,u.name AS "generatedBy" FROM reports r JOIN users u ON r.generated_by=u.user_id ORDER BY r.timestamp DESC`);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

apiRouter.get('/reports/:id', auth, requireRole('TEACHER','HOD'), async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM reports WHERE report_id=$1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Report not found' });
    res.json({ ...rows[0], data:JSON.parse(rows[0].data) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

apiRouter.get('/audit-logs', auth, requireRole('TEACHER','HOD'), async (req, res) => {
  try {
    const { limit=200, action, userId } = req.query;
    let query=`SELECT al.*,u.name AS "userName",u.role AS "userRole" FROM audit_logs al JOIN users u ON al.user_id=u.user_id WHERE 1=1`;
    const params=[];
    if (action) { params.push(action); query+=` AND al.action=$${params.length}`; }
    if (userId) { params.push(userId); query+=` AND al.user_id=$${params.length}`; }
    params.push(Number(limit));
    query+=` ORDER BY al.timestamp DESC LIMIT $${params.length}`;
    const { rows } = await pool.query(query, params);
    res.json(rows.map(l=>({ ...l, metadata:JSON.parse(l.metadata||'{}') })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

apiRouter.get('/users', auth, requireRole('TEACHER','HOD'), async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT user_id,name,email,role FROM users ORDER BY name`);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Since Vercel strips the prefix or passes it as is depending on vercel.json `src` matcher.
// With vercel.json `src: "/api/(.*)"`, the path to the app will include `/api`.
app.use('/api', apiRouter);

// Fallback in case Vercel rewrites it
app.use('/', apiRouter);

module.exports = app;