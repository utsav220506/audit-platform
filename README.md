# ⬛ AuditDoc — Audit-First Document Platform

> Immutable versioning · Full audit trail · Role-based access control

---

## 🚀 Quick Start

```bash
npm install
npm start
# → http://localhost:3001
```

For hot-reload during development:
```bash
npm run dev    # requires nodemon
```

---

## 🏗 Stack

| Layer     | Technology |
|-----------|-----------|
| Backend   | Node.js + Express |
| Database  | SQLite via `better-sqlite3` |
| Auth      | JWT (`jsonwebtoken`) + bcrypt |
| Frontend  | React 18 (CDN) + Babel Standalone |
| Styles    | Custom CSS (no framework) |

> **Note**: Babel Standalone compiles JSX in the browser on first load (~1-2s). For production, replace with a Vite/CRA build.

---

## 👥 Roles

| Action            | STUDENT   | TEACHER | HOD |
|-------------------|-----------|---------|-----|
| Create Document   | ✅        | ✅      | ❌  |
| Edit Document     | Own only  | All     | ❌  |
| View Documents    | Own only  | All     | All |
| Generate Reports  | ❌        | ✅      | ✅  |
| Share/Export      | ❌        | ✅      | ✅  |
| View Audit Logs   | ❌        | ✅      | ✅  |

---

## 📐 Architecture

```
User Action
    ↓
Express API  (server.js)
    ↓
Role Validation
    ↓
SQLite (better-sqlite3)  ← INSERT only, no UPDATE on versions
    ↓
Audit Log (every action)
    ↓
JSON Response → React SPA
```

---

## 🔒 Critical Constraints (from PRD §4)

- **No hard deletes** — zero DELETE operations in the codebase
- **No overwrites** — `DocumentVersion` rows are INSERT-only; the schema has no UPDATE paths
- **Every action logged** — `CREATE_DOC`, `EDIT_DOC`, `VIEW_DOC`, `GENERATE_REPORT`, `SHARE_DATA`
- **Role enforcement on every API endpoint** — via `auth` + `requireRole` middleware
- **Password hashing** — bcrypt with 12 rounds

---

## 🗄 Database Schema

```sql
users              — user_id, name, email, password_hash, role, created_at
documents          — document_id, title, created_by, created_at
document_versions  — version_id, document_id, content, timestamp,
                     created_by, hash (SHA-256), version_number
audit_logs         — log_id, action, user_id, resource_id,
                     resource_type, timestamp, metadata JSON
reports            — report_id, type, generated_by, timestamp, data JSON
share_logs         — share_id, shared_by, shared_to, document_id, timestamp
```

---

## 🌐 API Endpoints

```
POST /auth/register            Register (name, email, password, role)
POST /auth/login               Login → JWT

POST /documents                Create document (STUDENT, TEACHER)
GET  /documents                List documents (role-filtered)
GET  /documents/:id            Get document + latest version
POST /documents/:id/edit       Create new version (NEVER overwrites)
GET  /documents/:id/versions   All versions ordered DESC
GET  /documents/:id/compare    Diff ?v1=N&v2=M (LCS diff)

POST /reports/generate         Generate full report (TEACHER, HOD)
GET  /reports                  List reports
GET  /reports/:id              Get report data

POST /share                    Log a share event (TEACHER, HOD)
GET  /audit-logs               Paginated audit log (TEACHER, HOD)
GET  /users                    User list (for sharing UI)
```

---

## 🖼 Pages

| Page            | Access      | Description |
|----------------|-------------|-------------|
| Dashboard       | All roles   | Document list, stats, search |
| Document Editor | STUDENT, TEACHER | Write, save versions, view history, compare diff |
| Reports         | TEACHER, HOD | Generate & view JSON reports |
| Audit Logs      | TEACHER, HOD | Filterable full audit trail table |

---

## 📦 Edge Cases Handled (PRD §9)

- **Empty document edits** — allowed; creates a valid empty-content version
- **Concurrent edits** — each request reads the latest `version_number` and increments atomically via SQLite transactions
- **Unauthorized access** — 401 (no token) / 403 (wrong role) with descriptive errors
- **Missing versions in diff** — 404 with specific version number in error message
- **Large documents** — Express body limit set to 10 MB

---

## 🎨 UI Design Notes

- **Font stack**: Playfair Display (headers) · IBM Plex Mono (hashes/versions) · DM Sans (body)
- **Theme**: Dark archival aesthetic — slate background, amber accent, teal version badges
- **Diff view**: LCS-based line diff with green/red highlighting
- **Version history**: Timeline view with SHA-256 hash fingerprints

---

## 🔧 Environment Variables

```bash
PORT=3001              # default 3001
JWT_SECRET=your-secret # default: hardcoded dev value (change in production!)
```
