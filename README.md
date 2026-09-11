# Proxmox CT Control

PWA para ver o status de um container LXC do Proxmox VE e iniciar/parar ele.
Backend em Node.js guarda o token da API — o navegador nunca vê a credencial.

## 1. Criar o API Token no Proxmox

Datacenter → Permissions → API Tokens → Add.

- User: `root@pam` (ou crie um usuário dedicado, ver abaixo)
- Token ID: `pwa-control`
- **Desmarque** "Privilege Separation" só se quiser que o token herde as
  permissões do usuário direto; caso contrário, dê permissões explícitas ao
  token no path do container/node.

**Recomendado**: não use `root@pam`. Crie um usuário/role dedicado com só o
necessário:

```
pveum role add PWAControl -privs "VM.Audit,VM.PowerMgmt"
pveum user add pwa@pve
pveum aclmod / -user pwa@pve -role PWAControl
pveum user token add pwa@pve pwa-control -privsep 0
```

Guarde o **Token ID** (`pwa@pve!pwa-control`) e o **Secret** (UUID, só aparece
uma vez).

## 2. Configurar o servidor

```bash
cp .env.example .env
# edite .env com PROXMOX_HOST, PROXMOX_TOKEN_ID e PROXMOX_TOKEN_SECRET
npm install
npm start
```

Acesse `http://localhost:3000`, abra o menu de configurações (⚙) e escolha o
node e o container que o app vai controlar.

## 3. Expor via Cloudflare Tunnel

```bash
cloudflared tunnel create pve-control
cloudflared tunnel route dns pve-control pve-control.seudominio.com
```

No config do túnel (`~/.cloudflared/config.yml`):

```yaml
tunnel: pve-control
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: pve-control.seudominio.com
    service: http://localhost:3000
  - service: http_status:404
```

```bash
cloudflared tunnel run pve-control
```

O Cloudflare já entrega HTTPS válido no hostname — requisito para o PWA
instalar corretamente em iOS/Android fora da rede local.

### Importante: proteja o acesso remoto

Este app **não tem tela de login própria**. Como ele consegue ligar/desligar
um container, expor `pve-control.seudominio.com` sem nada na frente é
arriscado — qualquer um com a URL consegue derrubar o serviço.

Recomendo ativar **Cloudflare Access** (Zero Trust) no hostname do túnel,
exigindo login (com seu e-mail, por exemplo) antes de chegar no app. É grátis
para uso pessoal e não exige nenhuma mudança no código.

Como camada extra opcional, dá pra definir `APP_ACCESS_KEY` no `.env`: o
backend passa a exigir o header `x-app-key` em todas as chamadas `/api/*`.
Isso sozinho **não substitui** o Cloudflare Access (a chave ficaria visível
no app.js do navegador), mas ajuda como segunda camada.

## 4. Instalar como PWA

Acesse a URL (local ou via túnel) pelo Chrome/Safari no celular → "Adicionar
à tela de início". O `manifest.json` e o service worker já cuidam do resto.

## Endpoints da API interna

| Método | Rota                      | O que faz                                   |
|--------|----------------------------|----------------------------------------------|
| GET    | `/api/settings`            | Node/container atualmente configurados       |
| POST   | `/api/settings`            | Salva `{ node, vmid }`                        |
| GET    | `/api/nodes`                | Lista nodes do cluster                        |
| GET    | `/api/nodes/:node/lxc`     | Lista containers LXC do node                  |
| GET    | `/api/container/status`    | Status do container configurado               |
| POST   | `/api/container/start`     | Inicia o container configurado                |
| POST   | `/api/container/stop`      | Para o container (stop direto, sem ACPI)      |

## Notas

- `stop` corta a execução direto (equivalente a tirar o cabo de força), sem
  esperar o container desligar sozinho.
- `settings.json` na raiz guarda a seleção atual — não precisa de banco de
  dados para esse escopo.
- Se o certificado do Proxmox for self-signed (padrão), deixe
  `PROXMOX_INSECURE_SSL=true` no `.env`.
