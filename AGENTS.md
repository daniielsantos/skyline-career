# AGENTS.md — base para qualquer pedido

Produto: **Skyline Career** (carreira cargo + SimBrief/OFP + Watch) sobre MSFS via SimBridge.  
Marca/domínio público em transição: **Airframe** / `playairframe.com` — ver `docs/agent-context/26-rebrand-airframe.md`.  
Repo: `daniielsantos/skyline-career`.

## Sempre ler (nesta ordem)

1. `docs/agent-context/project-overview.md` — o que é o produto
2. `docs/agent-context/00-constraints.md` — hard rules
3. `docs/agent-context/01-current-state.md` — o que já shipou / versão
4. **Um** tópico de `docs/agent-context/` (índice: `README.md`) — só a área do pedido
5. Deploy/world: `deploy/README.md` se tocar CI/CD ou VPS

Não carregar transcript antigo nem todos os tópicos de uma vez.

## Criticar o pedido (obrigatório)

Antes de implementar, questione se:

- O pedido **não faz sentido** no produto atual, ou resolve o sintoma errado
- Há **impacto negativo**: quebra save/AppData, prod/VPS, economia, MP auth, updates desktop, performance
- É **escopo demais** / retrabalho / atalho que cria dívida (ex. retune global, reclass airframe, force-push)
- Falta **definição de pronto** (só local? installer? VPS?)

Se houver risco ou ambiguidade: **pare, diga o problema em 2–4 frases, proponha alternativa**. Não execute o caminho perigoso só porque foi pedido — peça confirmação explícita.

## Ao fechar um diagnóstico

No **mesmo turno**, grave sintoma → causa → fix no `.md` do tópico (`12` pax/EFB, `09` homologate, `17` inject, etc.). Lição no chat = sessão falhou.

## Defaults

- Commit / push / release / deploy prod **só** com pedido explícito
- Prefira patch mínimo alinhado ao código existente
- Economy/map: rules `career-economy-roadmap` / `career-map-expansion` só se a tarefa for isso
