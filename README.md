# Bairro

Protótipo third-person no browser: uma ilha procedural com tráfego, pedestres, carros e salas multijogador. Three.js, Rapier, bitECS e Zod, em TypeScript.

## Rodar

Precisa de Node 22+, pnpm (via `corepack`) e [Git LFS](https://git-lfs.com) para os modelos.

```sh
corepack enable
pnpm install
pnpm play      # jogo em http://localhost:6969 e servidor de salas em 127.0.0.1:8787
```

Separados: `pnpm dev` (só o jogo, modo solo) e `pnpm server` (só as salas).

O servidor só aceita conexões da página do jogo (`http://localhost:6969`). Para abrir a página por outro endereço, liste-o em `BAIRRO_ORIGINS`, separado por vírgula.

## Checar

```sh
pnpm typecheck
pnpm lint
pnpm test
```

O pre-commit roda os três. O CI roda de novo em cada PR.

## Documentação

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): camadas, o quadro, cidade, tráfego e como adicionar sistemas.
- [docs/DECISIONS.md](docs/DECISIONS.md): decisões de projeto.
- [docs/ASSETS.md](docs/ASSETS.md): origem e licença dos modelos e texturas.
