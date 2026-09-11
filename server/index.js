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
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  } catch {
    return { node: null, vmid: null };
  }
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// ---- Settings: qual node/container o app está configurado para controlar ----
app.get("/api/settings", (req, res) => {
  res.json(readSettings());
});

app.post("/api/settings", (req, res) => {
  const { node, vmid } = req.body || {};
  if (!node || !vmid) {
    return res.status(400).json({ error: "node e vmid são obrigatórios" });
  }
  const settings = { node, vmid: String(vmid) };
  writeSettings(settings);
  res.json(settings);
});

// ---- Descoberta: nodes e containers, para a tela de configuração ----
app.get("/api/nodes", async (req, res) => {
  try {
    res.json(await pve.listNodes());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get("/api/nodes/:node/lxc", async (req, res) => {
  try {
    res.json(await pve.listContainers(req.params.node));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---- Status e controle do container atualmente selecionado ----
app.get("/api/container/status", async (req, res) => {
  const { node, vmid } = readSettings();
  if (!node || !vmid) {
    return res.status(400).json({ error: "Nenhum container configurado. Acesse Configurações." });
  }
  try {
    res.json(await pve.getContainerStatus(node, vmid));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/container/start", async (req, res) => {
  const { node, vmid } = readSettings();
  if (!node || !vmid) return res.status(400).json({ error: "Nenhum container configurado." });
  try {
    res.json(await pve.startContainer(node, vmid));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/container/stop", async (req, res) => {
  const { node, vmid } = readSettings();
  if (!node || !vmid) return res.status(400).json({ error: "Nenhum container configurado." });
  try {
    res.json(await pve.stopContainer(node, vmid));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.use(express.static(PUBLIC_DIR));
app.get("*", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

app.listen(PORT, () => {
  console.log(`Proxmox CT Control rodando em http://localhost:${PORT}`);
});
