# Rebranding — Skyline Career → Airframe

Marca pública / domínio: **Airframe** (`playairframe.com`). Produto desktop ainda diz **Skyline Career** até a fase visual.

Decisão (2026-09-15): domínio ≠ rename automático do monorepo. Fases abaixo.

## Fase 0 — feita / em produção

- Domínio Cloudflare: `playairframe.com`
- World: `https://world.playairframe.com` (API MP)
- Produto UI/installer ainda **Skyline Career**

## Fase 1 — infra URL (sem rebrand visual)

- [ ] Landing / Pages em `playairframe.com` (opcional; não bloqueia MP) — precisa brief visual
- [ ] `flyairframe.com` redirect → play (se registado) — DNS Cloudflare
- [x] Desktop default MP URL: PlayModeGate prefill/placeholder + resolve fallback → `https://world.playairframe.com` (`PUBLIC_WORLD_API_URL`). Lab continua `http://127.0.0.1:8787` via `DEFAULT_WORLD_API_URL` / env.
- [ ] Email Routing `hello@playairframe.com` (quando houver site)

### Diagnóstico CI (2026-09-17)

- **Sintoma:** CI `Typecheck` falha em `App.tsx` — `suggestedMpWorldApiUrl` não existe no tipo do state.
- **Causa:** `vite-env` + `main.mjs` expõem o campo; `playModeConfig` state/`setPlayModeConfig` omitiram ao passar do IPC.
- **Fix:** incluir `suggestedMpWorldApiUrl?` no state e copiar de `getPlayConfig()`.

## Fase 2 — rebrand visual (precisa arte AIR|FRAME)

- [ ] Logo AIR|FRAME (nova composição; não search-replace do SKY|LINE)
- [ ] `BrandMark` / AuthGate / About / sidebar
- [ ] Ícones installer + Start Menu display name
- [ ] Copy UI: “Skyline Career” → “Airframe” (ou “Airframe Career”)
- [ ] Setup exe name (ex. `Airframe-Setup-…`) + `latest.yml` channel

## Fase 3 — paths / ids (migrar com cuidado)

- [ ] `%APPDATA%\Skyline Career\` → novo path **com** migração de saves
- [ ] Electron `appId` / protocol (quebra updates se mudarem sem plano)
- [ ] Repo / packages `skyline-career` — pode ficar legado por muito tempo
- [ ] Env `SKYLINE_*` / `skyline-paths` — **não** dia 1

## Não fazer no dia 1

- Renomear monorepo GitHub só por estética
- Mudar AppData sem migrator
- Trocar logo sem brief de arte (AIR|FRAME ≠ SKY|LINE simétrico)
- Landing genérica sem direção visual (ver user design rules)
