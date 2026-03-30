const API = "/api";

class AuditPlatformApp {
  constructor() {
    this.token = localStorage.getItem('token') || null;
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
    this.chartInstance = null;
    
    // Bindings
    this.init();
  }

  init() {
    // If already logged in
    if (this.token && this.user) {
      this.showDashboard();
    } else {
      document.getElementById('auth-page').style.display = 'flex';
      document.getElementById('app-dashboard').style.display = 'none';
      this.switchAuthTab('login');
    }
  }

  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  headers() {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.token}`
    };
  }

  // --- Auth Features --- //

  switchAuthTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.form-section').forEach(f => f.classList.remove('active'));
    
    document.getElementById(`${tab}-tab`).classList.add('active');
    document.getElementById(`${tab}-form`).classList.add('active');
  }

  async login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) return this.showToast('Please enter credentials', 'error');

    const btn = document.querySelector('#login-form button');
    try {
      btn.innerText = 'Authenticating...';
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      
      let data;
      try { data = await res.json(); } 
      catch { throw new Error(`Server returned non-JSON response (Status: ${res.status}). Check Vercel logs.`); }

      if (!res.ok) throw new Error(data.error || 'Login failed');

      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('token', this.token);
      localStorage.setItem('user', JSON.stringify(this.user));
      
      this.showToast('Login sequence complete.');
      this.showDashboard();
    } catch (e) {
      this.showToast(e.message, 'error');
    } finally {
      btn.innerText = 'Sign In';
    }
  }

  async register() {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const role = document.getElementById('reg-role').value;

    const btn = document.querySelector('#register-form button');
    try {
      btn.innerText = 'Provisioning...';
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role })
      });
      
      let data;
      try { data = await res.json(); } 
      catch { throw new Error(`Server returned non-JSON response (Status: ${res.status}). Check Vercel logs.`); }

      if (!res.ok) throw new Error(data.error || 'Registration failed');

      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('token', this.token);
      localStorage.setItem('user', JSON.stringify(this.user));
      
      this.showToast('Account provisioned successfully.');
      this.showDashboard();
    } catch (e) {
      this.showToast(e.message, 'error');
    } finally {
      btn.innerText = 'Create Account';
    }
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // UI Data Cleanup to prevent leaks between sessions
    document.getElementById('doc-title').value = '';
    document.getElementById('doc-content').value = '';
    document.getElementById('edit-id').value = '';
    document.getElementById('edit-content').value = '';
    document.getElementById('edit-pane').style.opacity = '0.5';
    document.getElementById('edit-pane').style.pointerEvents = 'none';
    document.getElementById('doc-modal').style.display = 'none';

    document.getElementById('app-dashboard').style.display = 'none';
    document.getElementById('auth-page').style.display = 'flex';
  }

  // --- Dashboard Sync --- //

  showDashboard() {
    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('app-dashboard').style.display = 'flex';
    
    // Set User details
    document.getElementById('user-name').innerText = this.user.name;
    document.getElementById('role-display').innerText = this.user.role;
    document.getElementById('user-avatar').innerText = this.user.name.charAt(0).toUpperCase();

    // Reset UI Visibility
    document.getElementById('nav-student').style.display = 'flex';
    document.getElementById('nav-teacher').style.display = 'none';
    document.getElementById('nav-hod').style.display = 'none';

    if (this.user.role === 'TEACHER' || this.user.role === 'HOD') {
      document.getElementById('nav-teacher').style.display = 'flex';
    }
    if (this.user.role === 'HOD') {
      document.getElementById('nav-hod').style.display = 'flex';
    }

    this.showSection('student'); // Default landing
  }

  showSection(section) {
    document.querySelectorAll('.section-view').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`${section}-section`).classList.add('active');
    
    const navItem = document.getElementById(`nav-${section}`);
    if (navItem) navItem.classList.add('active');

    const titleMap = { 'student': 'Document Repository', 'teacher': 'System Audit Logs', 'hod': 'Analytics & Intelligence' };
    document.getElementById('section-title').innerText = titleMap[section];

    // Triggers
    if (section === 'student') this.getDocs();
    if (section === 'teacher') this.getAudit();
    if (section === 'hod') this.generateReport();
  }

  // --- Document Module --- //

  async createDoc() {
    const title = document.getElementById('doc-title').value;
    const content = document.getElementById('doc-content').value;

    if (!title) return this.showToast('Title is required', 'error');

    try {
      const res = await fetch(`${API}/documents`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ title, content })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      this.showToast('Document initialized and securely hashed.');
      document.getElementById('doc-title').value = '';
      document.getElementById('doc-content').value = '';
      this.getDocs();
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  }

  async getDocs() {
    try {
      const res = await fetch(`${API}/documents`, { headers: this.headers() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const tbody = document.getElementById('docs-list');
      const emptyState = document.getElementById('docs-empty');
      
      tbody.innerHTML = '';
      
      if (data.length === 0) {
        emptyState.style.display = 'block';
      } else {
        emptyState.style.display = 'none';
        data.forEach(doc => {
          const modDate = doc.last_modified ? new Date(doc.last_modified).toLocaleString() : new Date(doc.created_at).toLocaleString();
          const tr = document.createElement('tr');
          const safeTitle = doc.title.replace(/'/g, "\\'");
          tr.innerHTML = `
            <td><strong>${doc.title}</strong></td>
            <td>${doc.author}</td>
            <td>v${doc.latest_version || 1}</td>
            <td class="text-subtle">${modDate}</td>
            <td style="display: flex; gap: 8px;">
              <button class="secondary-btn" title="Read Full Screen" onclick="app.viewDocument('${safeTitle}', '${doc.document_id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
              ${this.user.role === 'TEACHER' ? `
                <button class="secondary-btn" title="Compare Versions" onclick="app.openDiffModal('${doc.document_id}')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
                </button>
              ` : ''}
              ${['STUDENT', 'TEACHER'].includes(this.user.role) ? `
                <button class="secondary-btn" title="Load into Editor" onclick="app.loadDocument('${doc.document_id}')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
              ` : ''}
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  }

  async viewDocument(title, docId) {
    try {
      this.showToast('Pulling document from secure storage...', 'success');
      const res = await fetch(`${API}/documents/${docId}`, { headers: this.headers() });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);

      document.getElementById('modal-title').innerText = title + ` (v${data.latestVersion.version_number})`;
      document.getElementById('modal-text').innerText = data.latestVersion.content;
      document.getElementById('doc-modal').style.display = 'flex';
      
    } catch(e) {
      this.showToast(e.message, 'error');
    }
  }

  // --- Differential Versioning --- //

  async openDiffModal(docId) {
    try {
      this.showToast('Fetching document revisions...', 'success');
      const res = await fetch(`${API}/documents/${docId}/versions`, { headers: this.headers() });
      const versions = await res.json();
      
      if (!res.ok) throw new Error(versions.error);
      if (versions.length < 2) return this.showToast('Only one version exists. Cannot compute difference.', 'error');

      document.getElementById('diff-doc-id').value = docId;
      const v1sel = document.getElementById('diff-v1-select');
      const v2sel = document.getElementById('diff-v2-select');
      v1sel.innerHTML = '';
      v2sel.innerHTML = '';

      versions.forEach(v => {
        const o1 = document.createElement('option');
        const o2 = document.createElement('option');
        o1.value = v.version_number; o1.innerText = 'v'+v.version_number;
        o2.value = v.version_number; o2.innerText = 'v'+v.version_number;
        v1sel.appendChild(o1);
        v2sel.appendChild(o2);
      });

      // Default to Latest vs Previous
      v1sel.value = versions[0].version_number; // Latest
      v2sel.value = versions[1].version_number; // Previous

      document.getElementById('diff-modal-text').innerHTML = '<span class="text-subtle">Click Compare to render visual difference tree.</span>';
      document.getElementById('diff-modal').style.display = 'flex';
    } catch(e) {
      this.showToast(e.message, 'error');
    }
  }

  async executeDiff() {
    const docId = document.getElementById('diff-doc-id').value;
    const v2 = document.getElementById('diff-v1-select').value; // Newer
    const v1 = document.getElementById('diff-v2-select').value; // Older

    if (v1 === v2) return this.showToast('Identical versions selected', 'error');

    try {
      document.getElementById('diff-modal-text').innerHTML = '<span class="text-subtle">Computing cryptographic differences...</span>';
      const res = await fetch(`${API}/documents/${docId}/compare?v1=${v1}&v2=${v2}`, { headers: this.headers() });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);

      // Render Diff Array
      const diffHtml = data.diff.map(segment => {
        if (segment.type === 'added') return `<span class="diff-added">${segment.line}</span>\n`;
        if (segment.type === 'removed') return `<span class="diff-removed">${segment.line}</span>\n`;
        return `<span class="diff-unchanged">${segment.line}</span>\n`;
      }).join('');

      document.getElementById('diff-modal-text').innerHTML = diffHtml;
      this.showToast(`Diff Computed: ${data.stats.added} Additions, ${data.stats.removed} Removals`);
    } catch(e) {
      this.showToast(e.message, 'error');
    }
  }

  async loadDocument(docId) {
    try {
      this.showToast('Fetching document securely...', 'success');
      const res = await fetch(`${API}/documents/${docId}`, { headers: this.headers() });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);

      document.getElementById('edit-pane').style.opacity = '1';
      document.getElementById('edit-pane').style.pointerEvents = 'all';
      document.getElementById('edit-id').value = docId;
      document.getElementById('edit-content').value = data.latestVersion.content;
      
      if (this.user.role === 'HOD') {
        document.getElementById('edit-content').readOnly = true;
        document.getElementById('edit-btn').style.display = 'none';
        document.querySelector('#edit-pane h3').innerText = 'Viewing Document (Read-Only)';
      } else {
        document.getElementById('edit-content').readOnly = false;
        document.getElementById('edit-btn').style.display = 'block';
        document.querySelector('#edit-pane h3').innerText = 'Edit Document';
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch(e) {
      this.showToast(e.message, 'error');
    }
  }

  async editDoc() {
    const id = document.getElementById('edit-id').value;
    const content = document.getElementById('edit-content').value;

    if (!id || !content) return this.showToast('Requires active document and content modifications', 'error');

    try {
      document.getElementById('edit-btn').innerText = 'Committing...';
      const res = await fetch(`${API}/documents/${id}/edit`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      document.getElementById('edit-btn').innerText = 'Commit New Version';

      if (!res.ok) throw new Error(data.error);

      this.showToast(`Version ${data.versionNumber} generated securely.`);
      document.getElementById('edit-content').value = '';
      document.getElementById('edit-pane').style.opacity = '0.5';
      document.getElementById('edit-pane').style.pointerEvents = 'none';
      this.getDocs();
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  }

  // --- Audit Module --- //

  async getAudit() {
    try {
      const res = await fetch(`${API}/audit-logs?limit=50`, { headers: this.headers() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const tbody = document.getElementById('audit-list');
      tbody.innerHTML = '';

      data.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="text-subtle">${new Date(log.timestamp).toLocaleString()}</td>
          <td><span class="badge" style="background: rgba(139, 92, 246, 0.2); color: #c084fc">${log.action}</span></td>
          <td>${log.userRole}</td>
          <td class="text-subtle">${log.userName}</td>
          <td>${log.resource_id ? log.resource_id.substring(0,8) + '...' : 'System'}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      if (this.user.role === 'STUDENT') return; // Expected rejection for students
      this.showToast(e.message, 'error');
    }
  }

  // --- HOD Module --- //

  async generateReport() {
    if (this.user.role !== 'HOD') return;

    try {
      const res = await fetch(`${API}/reports/generate`, { 
        method: "POST", 
        headers: this.headers(),
        body: JSON.stringify({ type: 'FULL' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Populate Stats
      document.getElementById('stat-total').innerText = data.summary.auditSummary.reduce((sum, item) => sum + parseInt(item.count), 0);
      document.getElementById('stat-users').innerText = data.summary.totalUsers || 0;

      // Populate Chart
      const labels = data.summary.auditSummary.map(i => i.action.replace('_', ' '));
      const counts = data.summary.auditSummary.map(i => parseInt(i.count));

      const ctx = document.getElementById('audit-chart');
      
      if (this.chartInstance) {
        this.chartInstance.destroy();
      }

      this.chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: counts,
            backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: '#e2e8f0', padding: 20 } }
          }
        }
      });
      
      // Render Deep Student Analytics Table
      if (data.studentMetrics) {
        document.getElementById('student-metrics-card').style.display = 'block';
        const tbody = document.getElementById('student-metrics-body');
        tbody.innerHTML = '';
        data.studentMetrics.forEach(student => {
          const ratio = student.total_docs > 0 ? Math.round((student.audited_docs / student.total_docs) * 100) : 0;
          let statusBadge = '<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5">Pending Review</span>';
          if (student.total_docs === 0) statusBadge = '<span class="text-subtle">-</span>';
          else if (ratio === 100) statusBadge = '<span class="badge" style="background: rgba(34, 197, 94, 0.2); color: #86efac">Fully Audited</span>';
          else if (ratio > 0) statusBadge = `<span class="badge" style="background: rgba(234, 179, 8, 0.2); color: #fde047">Partial (${ratio}%)</span>`;

          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
          tr.innerHTML = `
            <td style="padding: 12px 8px;"><strong>${student.name}</strong></td>
            <td style="padding: 12px 8px;">${student.total_docs}</td>
            <td style="padding: 12px 8px;">${student.audited_docs} / ${student.total_docs}</td>
            <td style="padding: 12px 8px;">${statusBadge}</td>
          `;
          tbody.appendChild(tr);
        });
      }

      this.showToast('Intelligence Report regenerated successfully.');
    } catch (e) {
      if(e.message.indexOf('Access denied') === -1) {
        this.showToast(e.message, 'error');
      }
    }
  }
}

// Global initialization
window.app = new AuditPlatformApp();