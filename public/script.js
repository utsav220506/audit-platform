const API = "/api";

// ---------- AUTH ----------
async function register() {
  const name = regName.value;
  const email = regEmail.value;
  const password = regPassword.value;
  const role = regRole.value;

  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ name, email, password, role }),
  });

  alert((await res.json()).message || "Registered");
}

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      email: loginEmail.value,
      password: loginPassword.value
    }),
  });

  const data = await res.json();
  if (!res.ok) return alert(data.error);

  localStorage.setItem("token", data.token);

  const role = JSON.parse(atob(data.token.split(".")[1])).role;
  setupUI(role);
}

// ---------- UI ----------
function setupUI(role) {
  auth.style.display = "none";
  dashboard.style.display = "block";
  roleDisplay.innerText = "Role: " + role;

  if (role === "TEACHER") teacherSection.style.display = "block";
  if (role === "HOD") {
    teacherSection.style.display = "block";
    hodSection.style.display = "block";
  }
}

// ---------- DOC ----------
async function createDoc() {
  const res = await fetch(`${API}/documents`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      title: docTitle.value,
      content: docContent.value
    }),
  });

  alert("Created: " + (await res.json()).docId);
}

async function editDoc() {
  const res = await fetch(`${API}/documents/${editId.value}/edit`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ content: editContent.value }),
  });

  alert("Updated version: " + (await res.json()).version);
}

async function getDocs() {
  const res = await fetch(`${API}/documents`, { headers: headers() });
  const docs = await res.json();

  docsList.innerHTML = "";
  docs.forEach(d => {
    docsList.innerHTML += `<li>${d.title} (${d.document_id})</li>`;
  });
}

// ---------- VERSION ----------
async function getVersions() {
  const res = await fetch(
    `${API}/documents/${versionDocId.value}/versions`,
    { headers: headers() }
  );

  const versions = await res.json();

  versionsList.innerHTML = "";
  versions.forEach(v => {
    versionsList.innerHTML += `<li>Version ${v.version_number}</li>`;
  });
}

// ---------- AUDIT ----------
async function getAudit() {
  const res = await fetch(`${API}/audit-logs`, { headers: headers() });
  const logs = await res.json();

  auditList.innerHTML = "";
  logs.forEach(l => {
    auditList.innerHTML += `<li>${l.action}</li>`;
  });
}

// ---------- REPORT ----------
async function generateReport() {
  const res = await fetch(`${API}/audit-logs`, { headers: headers() });
  const logs = await res.json();

  const summary = {};
  logs.forEach(l => summary[l.action] = (summary[l.action] || 0) + 1);

  new Chart(document.getElementById("chart"), {
    type: "bar",
    data: {
      labels: Object.keys(summary),
      datasets: [{
        label: "Actions",
        data: Object.values(summary),
      }]
    }
  });
}

// ---------- UTIL ----------
function headers() {
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + localStorage.getItem("token")
  };
}