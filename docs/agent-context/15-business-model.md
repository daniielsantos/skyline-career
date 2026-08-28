# Product / business model — esboço

Atualizado 2026-08-28. **Não é spec de loja nem de billing** — decisão de produto para não voltar a discutir paywall de mapa ou dois SKUs.
Relógio MP: [14-mp-world-clock.md](./14-mp-world-clock.md). Tenant: `.cursor/rules/career-economy-roadmap.mdc`.

## Decisão (uma frase)

**Uma compra (~US$ 29–39), um client, dois modos (SP + MP incluso).** Career **global** no que já pagou. Sem lock de região. Sem assinatura obrigatória. Extras opcionais só depois de retenção — slots/cosmético/supporter, nunca avião, pay ou lot.

## O que o produto é

Skyline Career: economia viva (NPC + lots + idle/weather) + pool limitado de airframes (matrícula importa) + loop SimBrief/Watch.

- **SP** = âncora de longo prazo: save local, funciona se o server MP cair ou a comunidade encolher.
- **MP** = retenção: world compartilhado 24/7, mesma prateleira, mesma escassez de tails. Incluído na compra; **não** é SKU separado.

Não vender “Skyline SP” e “Skyline MP” como dois produtos.

## O que entra na compra (store copy)

Use isto (ou equivalente) em Steam / site / README de produto:

> **Skyline Career** é um addon de carreira cargo para MSFS. Uma compra. Sem mensalidade para jogar o que você comprou.
>
> **Incluído**
> - Modo carreira **single-player** (economia local, save seu, funciona offline).
> - **Multiplayer** no world compartilhado (economia que roda 24h; mesma licença).
> - **Mapa career global** — hub no Brasil (ou onde for) **não** restringe rotas. Frete, ferry e Demand usam o seed inteiro.
> - Mercado de airframes com **pool limitado** no world — matrículas finitas, não loja de aviões.
> - Updates de bugfix, balance e homologação de airframes do catálogo.
>
> **Não incluído (e não prometemos vender)**
> - Aviões extra por dinheiro real, moeda premium, boost de pay, skip de fila ou lots exclusivos.
> - Bloqueio de país/região atrás de DLC.

## Paywall — o que **não** fazer

| Tentação | Por quê não |
|----------|-------------|
| DLC “só voa na região comprada” | Expectativa MSFS = mapa livre; hub ≠ prisão |
| Dois SKUs SP / MP | Fragmenta economia, dobro de suporte, “preciso dos dois?” |
| Assinatura para o core | Já pagou o addon; compete com Navigraph / Game Pass |
| Vender airframe / pay / lot | Mata escassez e “avião único” |
| F2P day-one como fundação | Server 24/7 antes da receita; densidade pior que B2P pequeno |

## Extras opcionais (depois, nunca no launch)

Ordem de preferência. **Nenhum** corta o mapa nem o MP base.

| Extra | Quando | O que é | O que não é |
|-------|--------|---------|-------------|
| **Major version** (Skyline 2.x) | Anos depois | Economia / client novo, honesto | DLC mensal escondido |
| **+slot hangar / +WH** | Após CCU estável | Capacidade (mais operações paralelas) | Poder por voo; não cria tail no pool |
| **Cosméticos** | Qualquer hora após launch | Callsign plate, livery career, office | Gameplay |
| **World season opcional** | Depois de 1 world denso | Economia *fresh* / ranked para quem quer restart | Substituto do world principal |
| **World Supporter** (US$ 3–5/mês) | Só se infra apertar | Cosmético + crédito; **quem não paga continua jogando** | Gate do career |

Caminho in-game para 2º slot (grind lento) deve existir se IAP de slot existir — senão vira só cash.

**Slots IAP:** desbloqueiam *permissão* de operar outro tail. O airframe ainda vem do **pool / lease / buy in-game**. Cap global por company para whales não acumularem metade do world.

## Tiers (se IAP existir — não no day one)

| | Free **não** é o launch | **Purchase (launch)** | Extra (futuro) |
|--|-------------------------|------------------------|----------------|
| Acesso | — | SP + MP + mapa global | — |
| Hangar | — | Career completo (slots base generosos o bastante para não parecer demo; p.ex. 2–3 tails) | +1 tail / +1 WH |
| WH | — | 1 hub WH via CAPEX in-game | 2º sítio |
| Pool | — | Regras do world | Sem compra de matrícula |

Launch **não** é F2P com 1 slot. 1-slot-free só faria sentido como *demo* ou *observer*, não como career completo grátis.

## Fases (12–24 meses)

1. **Launch B2P** — SP polido + MP (mesmo client; MP pode ser beta). Zero IAP. World único denso.
2. **6 meses** — retenção, tick server, VAs, pool visível. Métricas CCU / churn.
3. **6–12 meses** — Season ranked **in-game** (prêmios de jogo, não pay).
4. **Ano 2** — IAP slots/cosmético **se** CCU justificar; ou major version; **não** lock de mapa.
5. **Se server ficar caro** — Supporter opcional, SP continua âncora.

## Durabilidade (plano B)

O que **dura** se MP ficar inviável: SP local + save + economia NPC.

O que **não** deve ser o único plano: “MP ou morre o produto”.

Um world denso > muitos shards vazios. Relógio: [14-mp-world-clock.md](./14-mp-world-clock.md).

## VA / desk (ponte para recorrência)

Detalhe: [16-va-logistics.md](./16-va-logistics.md).

- Monetizar **comodidade de desk** (auto-buy → scout → auto-haul) e **seats** VA — não preço de commodity nem lots.
- Internal haul + Ports/Demand realizam a arbitragem; automação não voa a ponte.

## Non-goals

- F2P como modelo principal de lançamento
- Assinatura obrigatória
- Paywall geográfico
- Dois produtos na loja
- Monetizar o pool de aeronaves

## Relação com o código (hoje)

Isto **não** muda regras de economia. Persistência já é `company_id` + `world_id` (SP = `'local'`). Billing/auth/members **não** implementar até um slice real precisar — ver tenant contract no roadmap.

## Checklist antes de publicar copy de loja

- [ ] Texto deixa claro: **uma compra, SP + MP, mapa global**
- [ ] Nenhuma frase implica “compre a região X para voar”
- [ ] MP descrito como incluso, não “edição à parte”
- [ ] Escassez = regra do world, não microtransação de avião
