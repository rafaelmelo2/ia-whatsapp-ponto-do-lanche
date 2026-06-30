# Orquestração — ambientes e ingress

O `compose.yaml` da raiz é a base. Ele faz `include:` de **dois** arquivos daqui,
escolhidos por variáveis do `.env` — sem nenhum `cp`:

| Variável        | Valores                         | Controla                          |
| --------------- | ------------------------------- | --------------------------------- |
| `ENVIRONMENT`   | `local` · `staging` · `prod`    | `compose.${ENVIRONMENT}.yaml`     |
| `INGRESS_MODE`  | `loopback` · `gateway` · `edge` | `ingress.${INGRESS_MODE}.yaml`    |

Subir: `docker compose up -d`. Derrubar: `docker compose down` (dados sobrevivem;
use `-v` só para apagar volumes).

## Ambientes (`compose.*.yaml`)
- **local** — expõe Postgres/Redis no loopback do host em portas altas
  (`127.0.0.1:15432` / `16379`) para debug com `psql`/`redis-cli`.
- **staging / prod** — DB/Redis só na rede interna do compose; `restart: always`.

## Ingress (`ingress.*.yaml` + `../services/proxy/Caddyfile.*`)
- **loopback** (dev) — Caddy em `127.0.0.1:8080`, HTTP puro, sem TLS.
  Healthcheck: `curl http://127.0.0.1:8080/health`.
- **gateway** — Caddy em `0.0.0.0:80` (HTTP), atrás de um LB/edge externo que
  termina TLS.
- **edge** — Caddy exposto à internet, termina TLS com ACME automático
  (`80` + `443`). Defina `DOMAIN` no `.env`; volumes `caddydata`/`caddyconfig`
  guardam os certificados.

> Os caminhos de volume nos `ingress.*.yaml` são relativos a **este diretório**
> (regra do `include` do Compose): por isso `../services/proxy/Caddyfile.*`.

## Expor o webhook do Meta em dev (cloudflared)
O WhatsApp Cloud API exige um endpoint **HTTPS público** para o webhook. Em dev
(modo `loopback`, sem TLS), use um túnel do Cloudflare apontando para o proxy:

```bash
# Túnel efêmero (sem conta) — gera uma URL https://*.trycloudflare.com
cloudflared tunnel --url http://127.0.0.1:8080
```

Registre a URL `https://<gerada>.trycloudflare.com/webhook` no painel do Meta e
use o mesmo `WHATSAPP_VERIFY_TOKEN` do `.env`. Para uma URL estável, crie um
túnel nomeado (`cloudflared tunnel create sirvase-dev`) com `CNAME` no seu
domínio. Implementação do endpoint `/webhook` vem no Épico 4.
