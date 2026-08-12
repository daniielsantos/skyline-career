# Current state (2026-08-12)

## Desktop

| Versão | Tag | Notas |
|--------|-----|--------|
| **0.3.19** (latest) | [v0.3.19](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.19) | Inject permanece armed até o write terminar |
| 0.3.18 | [v0.3.18](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.18) | Taxi fuel cap 50% Due; inject timeout 15s/180s + progress; DR400 delay 400ms |
| 0.3.17 | [v0.3.17](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.17) | Host: recovery após `0xC00000B0`, sem ClearDataDefinition dinâmico, serialize ops |
| 0.3.16 | v0.3.16 | Clamp fuel OFP → tank capacity |

## Branch

`main` — handoff em `docs/agent-context/`.

## O que validar após 0.3.19

1. Inject não desarma cedo demais enquanto o write ainda corre.
2. Drenar fuel no EFB com OFP curto → Preflight **não** fica READY (taxi cap).
3. Inject com Host doente → falha ≤ ~3 min com mensagem, não Writing infinito.
4. Host 0.3.17+ ainda necessário para recovery de PIPE CLOSED.
