import axios from "axios";
import https from "https";

const {
  PROXMOX_HOST,
  PROXMOX_PORT = "8006",
  PROXMOX_TOKEN_ID,
  PROXMOX_TOKEN_SECRET,
  PROXMOX_INSECURE_SSL = "true",
} = process.env;

if (!PROXMOX_HOST || !PROXMOX_TOKEN_ID || !PROXMOX_TOKEN_SECRET) {
  console.warn(
    "[proxmox] Faltam variáveis de ambiente (PROXMOX_HOST / PROXMOX_TOKEN_ID / PROXMOX_TOKEN_SECRET). Confira o .env."
  );
}

const client = axios.create({
  baseURL: `https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json`,
  headers: {
    Authorization: `PVEAPIToken=${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_SECRET}`,
  },
  httpsAgent: new https.Agent({
    rejectUnauthorized: PROXMOX_INSECURE_SSL !== "true" ? true : false,
  }),
  timeout: 8000,
});

function unwrap(promise) {
  return promise
    .then((res) => res.data.data)
    .catch((err) => {
      const detail =
        err.response?.data?.errors ||
        err.response?.data ||
        err.message ||
        "Erro desconhecido ao falar com o Proxmox";
      const e = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      e.status = err.response?.status || 502;
      throw e;
    });
}

export function listNodes() {
  return unwrap(client.get("/nodes"));
}

export function listContainers(node) {
  return unwrap(client.get(`/nodes/${node}/lxc`));
}

export function getContainerStatus(node, vmid) {
  return unwrap(client.get(`/nodes/${node}/lxc/${vmid}/status/current`));
}

export function startContainer(node, vmid) {
  return unwrap(client.post(`/nodes/${node}/lxc/${vmid}/status/start`));
}

// "stop" corta a execução direto (equivalente a tirar o cabo de força).
export function stopContainer(node, vmid) {
  return unwrap(client.post(`/nodes/${node}/lxc/${vmid}/status/stop`));
}
