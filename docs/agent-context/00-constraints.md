# Hard constraints (não violar)

Acumulado das sessões Skyline Career / msfs-compat-layer.

## Produto / economia

- **Não** descapar crew pesado “só pra caber”.
- **Não** retunar `Dry` / `CARGO_FLOW_BALANCE` sem pedido explícito e medição.
- **Não** commitar dumps de pulse / logs de debug / artefatos de diagnóstico temporários.
- **Não** force-push em `main`/`master`.

## Desktop / teste

- Teste no desktop **instalado** costuma precisar de **release** (ou hot-swap consciente do Host).
- Install típico: `%LOCALAPPDATA%\Programs\Skyline Career`
- Dados: `%APPDATA%\Skyline Career\career\`
- Host empacotado: `%LOCALAPPDATA%\Programs\Skyline Career\resources\host\`

## Twin Otter / fuel

- **Não** mapear wing tanks como `LEFT_AUX` / `RIGHT_AUX` sem writetest live.
- Escrita AUX clássica → `UNRECOGNIZED_ID` → `ReceiveMessage 0xC00000B0` → Host morto / Watch `PIPE CLOSED`.
- OFP acima da capacidade dos tanques: career inject deve **clamp** (`clampFuelToCapacity`), não forçar overflow.

## Git / release

- Commit só quando o usuário pedir.
- Release desktop: `npm run release:desktop -- --bump patch --yes`
- Repo GitHub: `daniielsantos/skyline-career`
