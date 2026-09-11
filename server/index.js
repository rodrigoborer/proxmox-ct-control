import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as pve from "./proxmox.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const SETTINGS_PATH = path.join(__dirname, "..", "settings.json");
const PORT = process.env.PORT || 3000;
const APP_ACCESS_KEY = process.env.APP_ACCESS_KEY || "";

const app = express();
app.use(express.json());

// Proteção opcional por chave. Se APP_ACCESS_KEY não estiver definida,
// isso fica desativado (recomendado: proteger com Cloudflare Access).
app.use("/api", (req, res, next) => {
  if (!APP_ACCESS_KEY) return next();
  if (req.header("x-app-key") === APP_ACCESS_KEY) return next();
  return res.status(401).json({ error: "Unauthorized" });
});

function readSettings() {
  try {
    const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    // Formato atual: { containers: [{ node, vmid }, ...] }
    if (Array.isArray(data.containers)) return data;
    return { containers: [] };
  } catch {
    return { containers: [] };
  }
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// ---- Settings: quais containers o app está configurado para controlar ----
app.get("/api/settings", (req, res) => {
  res.json(readSettings());
});

app.post("/api/settings", (req, res) => {
  const { containers } = req.body || {};
  if (!Array.isArray(containers)) {
    return res.status(400).json({ error: "containers deve ser uma lista de { node, vmid }" });
  }
  const clean = containers
    .filter((c) => c && c.node && c.vmid)
    .map((c) => ({ node: c.node, vmid: String(c.vmid) }));
  const settings = { containers: clean };
  writeSettings(settings);
  res.json(settings);
});

// ---- Descoberta: todos os containers de todos os nodes, para a tela de configuração ----
app.get("/api/all-containers", async (req, res) => {
  try {
    const nodes = await pve.listNodes();
    const lists = await Promise.all(
      nodes.map(async (n) => {
        const containers = await pve.listContainers(n.node);
        return containers.map((c) => ({ node: n.node, vmid: String(c.vmid), name: c.name }));
      })
    );
    const all = lists.flat().sort((a, b) => Number(a.vmid) - Number(b.vmid));
    res.json(all);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---- Status de todos os containers selecionados, ordenados por vmid ----
app.get("/api/containers", async (req, res) => {
  const { containers } = readSettings();
  if (!containers.length) return res.json([]);
  try {
    const results = await Promise.all(
      containers.map(async ({ node, vmid }) => {
        try {
          const status = await pve.getContainerStatus(node, vmid);
          return { node, vmid, ...status, error: null };
        } catch (err) {
          return { node, vmid, status: "unknown", error: err.message };
        }
      })
    );
    results.sort((a, b) => Number(a.vmid) - Number(b.vmid));
    res.json(results);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---- Ações sobre um container específico ----
const actionHandlers = {
  start: pve.startContainer,
  stop: pve.stopContainer,
  shutdown: pve.shutdownContainer,
  restart: pve.rebootContainer,
};

app.post("/api/containers/:node/:vmid/:action", async (req, res) => {
  const { node, vmid, action } = req.params;
  const handler = actionHandlers[action];
  if (!handler) return res.status(400).json({ error: `Ação inválida: ${action}` });
  try {
    res.json(await handler(node, vmid));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.use(express.static(PUBLIC_DIR));
app.get("*", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

app.listen(PORT, () => {
  console.log(`Proxmox CT Control rodando em http://localhost:${PORT}`);
});
