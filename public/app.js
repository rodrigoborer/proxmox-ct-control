const homeView = document.getElementById("homeView");
const settingsView = document.getElementById("settingsView");
const settingsBtn = document.getElementById("settingsBtn");
const backBtn = document.getElementById("backBtn");

const cardList = document.getElementById("cardList");
const emptyMsg = document.getElementById("emptyMsg");
const cardTemplate = document.getElementById("cardTemplate");

const checkboxList = document.getElementById("checkboxList");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsMsg = document.getElementById("settingsMsg");

let pollTimer = null;
// node+vmid -> elemento do card, pra não recriar o DOM a cada poll
const cardEls = new Map();

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
  if (h === 0) return `ativo há ${m}min`;
  return `ativo há ${h}h ${m}min`;
}

function keyOf(c) {
  return `${c.node}:${c.vmid}`;
}

function ensureCard(container) {
  const key = keyOf(container);
  if (cardEls.has(key)) return cardEls.get(key);

  const node = cardTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.node = container.node;
  node.dataset.vmid = container.vmid;

  node.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => runAction(container.node, container.vmid, btn.dataset.action));
  });

  cardEls.set(key, node);
  cardList.appendChild(node);
  return node;
}

function renderCard(node, data) {
  const running = data.status === "running";
  const label = node.querySelector(".ct-label");
  const dot = node.querySelector(".status-dot");
  const text = node.querySelector(".status-text");
  const uptime = node.querySelector(".uptime");
  const errorEl = node.querySelector(".card-error");

  label.textContent = data.name ? `${data.name} (${data.vmid})` : `CT ${data.vmid}`;

  if (data.error) {
    dot.className = "status-dot status-unknown";
    text.textContent = "Indisponível";
    uptime.textContent = "";
    errorEl.textContent = data.error;
  } else {
    dot.className = `status-dot ${running ? "status-running" : "status-stopped"}`;
    text.textContent = running ? "Rodando" : "Parado";
    uptime.textContent = running ? fmtUptime(data.uptime) : "";
    errorEl.textContent = "";
  }

  const startBtn = node.querySelector('[data-action="start"]');
  const stopBtn = node.querySelector('[data-action="stop"]');
  const restartBtn = node.querySelector('[data-action="restart"]');
  const shutdownBtn = node.querySelector('[data-action="shutdown"]');

  startBtn.disabled = running;
  stopBtn.disabled = !running;
  restartBtn.disabled = !running;
  shutdownBtn.disabled = !running;
}

async function refreshAll() {
  try {
    const containers = await api("/containers");
    emptyMsg.classList.toggle("hidden", containers.length > 0);

    const seen = new Set();
    for (const c of containers) {
      seen.add(keyOf(c));
      const node = ensureCard(c);
      renderCard(node, c);
    }

    // Remove cards de containers que saíram da configuração
    for (const [key, node] of cardEls) {
      if (!seen.has(key)) {
        node.remove();
        cardEls.delete(key);
      }
    }
  } catch (err) {
    emptyMsg.textContent = err.message;
    emptyMsg.classList.remove("hidden");
  }
}

function startPolling() {
  refreshAll();
  clearInterval(pollTimer);
  pollTimer = setInterval(refreshAll, 5000);
}

async function runAction(node, vmid, action) {
  const key = `${node}:${vmid}`;
  const cardEl = cardEls.get(key);
  const buttons = cardEl ? cardEl.querySelectorAll(".btn") : [];
  buttons.forEach((b) => (b.disabled = true));
  try {
    await api(`/containers/${node}/${vmid}/${action}`, { method: "POST" });
    setTimeout(refreshAll, 1500);
  } catch (err) {
    if (cardEl) cardEl.querySelector(".card-error").textContent = err.message;
    setTimeout(refreshAll, 500);
  }
}

// ---- Configurações ----
async function openSettings() {
  homeView.classList.add("hidden");
  settingsView.classList.remove("hidden");
  clearInterval(pollTimer);
  settingsMsg.textContent = "";
  checkboxList.innerHTML = "<p class='hint'>Carregando…</p>";

  try {
    const [all, current] = await Promise.all([api("/all-containers"), api("/settings")]);
    const selectedKeys = new Set(current.containers.map((c) => `${c.node}:${c.vmid}`));

    checkboxList.innerHTML = "";
    for (const c of all) {
      const key = `${c.node}:${c.vmid}`;
      const item = document.createElement("label");
      item.className = "checkbox-item";
      item.innerHTML = `
        <input type="checkbox" value="${key}" ${selectedKeys.has(key) ? "checked" : ""} />
        <span>${c.vmid} — ${c.name}</span>
        <span class="ct-node">${c.node}</span>
      `;
      checkboxList.appendChild(item);
    }

    if (all.length === 0) {
      checkboxList.innerHTML = "<p class='hint'>Nenhum container encontrado no cluster.</p>";
    }
  } catch (err) {
    checkboxList.innerHTML = "";
    settingsMsg.style.color = "#ef4444";
    settingsMsg.textContent = err.message;
  }
}

saveSettingsBtn.addEventListener("click", async () => {
  const checked = [...checkboxList.querySelectorAll('input[type="checkbox"]:checked')];
  const containers = checked.map((cb) => {
    const [node, vmid] = cb.value.split(":");
    return { node, vmid };
  });

  try {
    await api("/settings", {
      method: "POST",
      body: JSON.stringify({ containers }),
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
