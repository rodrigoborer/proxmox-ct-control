const homeView = document.getElementById("homeView");
const settingsView = document.getElementById("settingsView");
const settingsBtn = document.getElementById("settingsBtn");
const backBtn = document.getElementById("backBtn");

const ctLabel = document.getElementById("ctLabel");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const uptimeEl = document.getElementById("uptime");
const errorMsg = document.getElementById("errorMsg");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

const nodeSelect = document.getElementById("nodeSelect");
const ctSelect = document.getElementById("ctSelect");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsMsg = document.getElementById("settingsMsg");

let pollTimer = null;

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function fmtUptime(seconds) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `ativo há ${h}h ${m}min`;
}

async function refreshStatus() {
  try {
    const data = await api("/container/status");
    errorMsg.textContent = "";
    const running = data.status === "running";
    statusDot.className = `status-dot ${running ? "status-running" : "status-stopped"}`;
    statusText.textContent = running ? "Rodando" : "Parado";
    uptimeEl.textContent = running ? fmtUptime(data.uptime) : "";
    startBtn.disabled = running;
    stopBtn.disabled = !running;
    ctLabel.textContent = data.name ? `${data.name} (${data.vmid ?? ""})` : "Container";
  } catch (err) {
    statusDot.className = "status-dot status-unknown";
    statusText.textContent = "Indisponível";
    uptimeEl.textContent = "";
    errorMsg.textContent = err.message;
    startBtn.disabled = true;
    stopBtn.disabled = true;
  }
}

function startPolling() {
  refreshStatus();
  clearInterval(pollTimer);
  pollTimer = setInterval(refreshStatus, 5000);
}

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  try {
    await api("/container/start", { method: "POST" });
    setTimeout(refreshStatus, 1500);
  } catch (err) {
    errorMsg.textContent = err.message;
    startBtn.disabled = false;
  }
});

stopBtn.addEventListener("click", async () => {
  stopBtn.disabled = true;
  try {
    await api("/container/stop", { method: "POST" });
    setTimeout(refreshStatus, 1500);
  } catch (err) {
    errorMsg.textContent = err.message;
    stopBtn.disabled = false;
  }
});

// ---- Configurações ----
async function openSettings() {
  homeView.classList.add("hidden");
  settingsView.classList.remove("hidden");
  clearInterval(pollTimer);
  settingsMsg.textContent = "";
  nodeSelect.innerHTML = "<option>Carregando…</option>";
  ctSelect.innerHTML = "";

  try {
    const [nodes, current] = await Promise.all([api("/nodes"), api("/settings")]);
    nodeSelect.innerHTML = nodes
      .map((n) => `<option value="${n.node}">${n.node}</option>`)
      .join("");

    if (current.node) nodeSelect.value = current.node;
    await loadContainers(current.vmid);
  } catch (err) {
    settingsMsg.textContent = err.message;
  }
}

async function loadContainers(preselectVmid) {
  ctSelect.innerHTML = "<option>Carregando…</option>";
  try {
    const containers = await api(`/nodes/${nodeSelect.value}/lxc`);
    ctSelect.innerHTML = containers
      .map((c) => `<option value="${c.vmid}">${c.vmid} — ${c.name}</option>`)
      .join("");
    if (preselectVmid) ctSelect.value = preselectVmid;
  } catch (err) {
    settingsMsg.textContent = err.message;
  }
}

nodeSelect.addEventListener("change", () => loadContainers());

saveSettingsBtn.addEventListener("click", async () => {
  try {
    await api("/settings", {
      method: "POST",
      body: JSON.stringify({ node: nodeSelect.value, vmid: ctSelect.value }),
    });
    settingsMsg.style.color = "#22c55e";
    settingsMsg.textContent = "Salvo.";
    setTimeout(closeSettings, 500);
  } catch (err) {
    settingsMsg.style.color = "#ef4444";
    settingsMsg.textContent = err.message;
  }
});

function closeSettings() {
  settingsView.classList.add("hidden");
  homeView.classList.remove("hidden");
  startPolling();
}

settingsBtn.addEventListener("click", openSettings);
backBtn.addEventListener("click", closeSettings);

startPolling();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
