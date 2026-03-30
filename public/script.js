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
          tr.innerHTML = `
            <td><strong>${doc.title}</strong></td>
            <td>${doc.author}</td>
            <td>v${doc.latest_version || 1}</td>
            <td class="text-subtle">${modDate}</td>
            <td>
              <button class="secondary-btn" onclick="app.setupEdit('${doc.document_id}')">Edit</button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  }

  setupEdit(docId) {
    document.getElementById('edit-pane').style.opacity = '1';
    document.getElementById('edit-pane').style.pointerEvents = 'all';
    document.getElementById('edit-id').value = docId;
    this.showToast('Editor unlocked for Document ID: ' + docId.substring(0,6) + '...', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
          <td class="text-subtle">${log.user_id.substring(0,8)}...</td>
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