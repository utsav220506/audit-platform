# Enterprise Intelligence Auditing Platform 🛡️📊

[![Deployment](https://img.shields.io/badge/Deployed_on-Vercel-black?logo=vercel)](#)
[![Database](https://img.shields.io/badge/Database-Supabase_PostgreSQL-3ECF8E?logo=supabase)](#)
[![Backend](https://img.shields.io/badge/Backend-Node._Serverless-339933?logo=nodedotjs)](#)
[![UI](https://img.shields.io/badge/UI-Glassmorphism_CSS-0ea5e9)](#)

A high-performance, full-stack intelligence platform engineered for rigorous data tracking, strict role-based isolation (RBAC), and cryptographic document version control. Built specifically for complex educational or corporate environments where maintaining an immaculate audit trail is essential.

## ✨ Core Features

### 🔐 Strict Role-Based Access Control (RBAC)
The platform divides users into three isolated tiers, automatically configuring their UI constraints:
* **Student (Author):** Isolated environment. Can only create, read, and strictly edit their own documents. Cannot access system logs.
* **Teacher (Auditor):** Surveillance tier. Automatically granted Read-Only access to all student documents. Empowered to securely generate differential corrections. Has access to the Immutable Audit Stream.
* **HOD (Administrator):** Deep Analytics tier. Retains universal Read-Only document access and commands the Intelligence Reporting Engine to dynamically visualize real-time tracking data across the entire institution.

### 📜 Cryptographic Version Control (VCS)
Every time a document is edited, the system **never destroys** the old draft. Instead, it natively implements internal versioning (e.g., `v1`, `v2`) locking each specific state to a unique `SHA-256` cryptographic hash. 
* Integrated with a **Differential Analysis Engine** allowing Auditors to perform GitHub-style side-by-side code comparisons highlighting mathematically added or removed sentences.

### 🕵️ Immutable Audit Trails
Integrated event-triggers natively hook into the Postgres Database. Every single action—whether it is `VIEW_DOC`, `EDIT_DOC`, or `GENERATE_REPORT`—is secretly parsed, timestamped, and bound to the user's ID, guaranteeing an untamperable record of exactly "who" did "what" and "when".

### 📈 Intelligence Reporting Engine
The Head of Department (HOD) commands a dynamic Analytics Dashboard using `Chart.js`. The backend parses thousands of micro-logs to generate macro-level Doughnut Charts mapping system operational volume, while surgically indexing specific student tracking metrics (e.g., verifying if a Teacher has fully *Audited* a Student's specific workloads).

---

## 💻 Technical Architecture

* **Frontend:** Ultra-modern Vanilla JS + ES6 Classes, built on top of a dynamic CSS Glassmorphism design system for a premium aesthetic interface.
* **Backend:** `Express.js` engineered entirely for Edge-compatible **Vercel Serverless Functions** (`api/index.js`), eliminating idle server costs.
* **Database:** `PostgreSQL` powered by **Supabase Connection Poolers**. Features normalized relational architecture tracking Users, Documents, Version SHAs, and System Audit Logs tightly.

## 🚀 Setup & Execution

### 1. Database Initialization (Supabase)
Run the core SQL schema in your Supabase SQL Editor:
```sql
CREATE TABLE IF NOT EXISTS users ( user_id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS documents ( document_id TEXT PRIMARY KEY, title TEXT NOT NULL, created_by TEXT, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS document_versions ( version_id TEXT PRIMARY KEY, document_id TEXT, content TEXT, timestamp TIMESTAMP DEFAULT NOW(), created_by TEXT, hash TEXT, version_number INTEGER );
CREATE TABLE IF NOT EXISTS audit_logs ( log_id TEXT PRIMARY KEY, action TEXT, user_id TEXT, resource_id TEXT, resource_type TEXT, timestamp TIMESTAMP DEFAULT NOW(), metadata TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS reports ( report_id TEXT PRIMARY KEY, type TEXT NOT NULL, generated_by TEXT NOT NULL REFERENCES users(user_id), timestamp TIMESTAMP DEFAULT NOW(), data TEXT );
```

### 2. Vercel Configuration
Define the following securely under **Environment Variables**:
* `DATABASE_URL`: Your Supabase Postgres pooler string.
* `JWT_SECRET`: Your secure signature key.

### 3. Deployment
The web app naturally deploys by pushing standard HTML/CSS/JS into the `/public` root, mapping the serverless database interface directly through `/api/*` inside `vercel.json`.
