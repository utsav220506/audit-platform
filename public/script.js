const API = "/api";

function switchTab(tab) {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginTab = document.getElementById("login-tab");
  const registerTab = document.getElementById("register-tab");

  loginForm.classList.remove("active");
  registerForm.classList.remove("active");
  loginTab.classList.remove("active");
  registerTab.classList.remove("active");

  if (tab === "login") {
    loginForm.classList.add("active");
    loginTab.classList.add("active");
  } else {
    registerForm.classList.add("active");
    registerTab.classList.add("active");
  }
}

async function register() {
  const name = document.getElementById("reg-name").value;
  const email = document.getElementById("reg-email").value;
  const password = document.getElementById("reg-password").value;
  const role = document.getElementById("reg-role").value;

  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, role }),
  });

  const data = await res.json();

  if (res.ok) {
    alert("Registered successfully!");
  } else {
    alert(data.error || "Error");
  }
}

async function login() {
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) return alert(data.error);

  localStorage.setItem("token", data.token);

  const payload = JSON.parse(atob(data.token.split(".")[1]));
  document.getElementById("auth-page").style.display = "none";
  document.getElementById("app").style.display = "flex";
  document.getElementById("role-display").innerText = payload.role;
}

  const data = await res.json();
  if (!res.ok) return alert(data.error);

  localStorage.setItem("token", data.token);

  const role = JSON.parse(atob(data.token.split(".")[1])).role;

  authPage.style.display = "none";
  app.style.display = "flex";
  roleDisplay.innerText = role;

  showSection("student");


function showSection(section) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.getElementById(section + "-section").classList.add("active");
}

function headers() {
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + localStorage.getItem("token")
  };
}

async function createDoc() {
  const res = await fetch(`${API}/documents`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ title: docTitle.value, content: docContent.value }),
  });
  alert("Created");
}

async function getDocs() {
  const res = await fetch(`${API}/documents`, { headers: headers() });
  const docs = await res.json();

  docsList.innerHTML = "";
  docs.forEach(d => docsList.innerHTML += `<li>${d.title}</li>`);
}

async function editDoc() {
  await fetch(`${API}/documents/${editId.value}/edit`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ content: editContent.value }),
  });
  alert("Updated");
}

async function getAudit() {
  const res = await fetch(`${API}/audit-logs`, { headers: headers() });
  const logs = await res.json();

  audit.innerHTML = "";
  logs.forEach(l => audit.innerHTML += `<li>${l.action}</li>`);
}

async function generateReport() {
  const res = await fetch(`${API}/audit-logs`, { headers: headers() });
  const logs = await res.json();

  const summary = {};
  logs.forEach(l => summary[l.action] = (summary[l.action] || 0) + 1);

  new Chart(chart, {
    type: "bar",
    data: {
      labels: Object.keys(summary),
      datasets: [{ data: Object.values(summary) }]
    }
  });
}