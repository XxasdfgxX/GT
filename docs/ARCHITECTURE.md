# Arquitetura

Bairro é um protótipo third-person no browser. O código de jogo não importa Three.js nem Rapier. Cada serviço entra por uma interface e chega nos sistemas por um `GameContext`.

## Camadas

As dependências apontam para dentro:

`app` → `game` → `engine` → APIs do browser

- `app` sobe o canvas, cria os adaptadores e roda o quadro.
- `game` tem componentes, sistemas e o que spawna o jogador, o carro e o mapa.
- `engine/core` tem o relógio, o barramento, o logger e a matemática pura.
- `engine/render`, `engine/physics` e `engine/input` definem a interface e a implementação.
- `content` é dado validado com Zod. `game` e `app` leem esse dado. `content` não importa ninguém.
- `ui` é DOM. Só `app` monta o HUD.

O ESLint barra `three` e `@dimforge/rapier3d-compat` fora dos adaptadores. Features não se chamam entre si: o que precisa atravessar usa o `EventBus` (`player:entered-vehicle`, `player:exited-vehicle`).

## O quadro

A simulação anda a 60 Hz. A renderização usa o tempo que sobrou.

1. `beginFrame` soma o tempo real, limitado a 0,25 s, e devolve no máximo 5 passos. O excesso é descartado para um travamento não virar uma espiral.
2. O input é amostrado uma vez. Pulo e `E` ficam latched até um sistema consumir, então um quadro sem passo não perde o clique.
3. Cada passo fixo, nesta ordem: interação, locomoção, carro, `physics.step`, cópia da física para o transform atual, rodas, orientação visual do jogador.
4. `endFrame` calcula `alpha` (0 a 1) entre o estado anterior e o atual.
5. A malha interpola posição e rotação. A câmera se aproxima do alvo com um fator que depende do tempo do quadro. O renderer desenha.

O relógio está em `src/engine/core/time.ts`. A ordem dos sistemas está em `src/game/simulate.ts`.

## Como adicionar um sistema

1. Se precisar de estado, acrescente campos numéricos em `src/game/ecs/components.ts` e inclua o componente na query em `src/game/ecs/queries.ts`.
2. Crie `src/game/systems/meu-sistema.ts`. A função recebe `(ctx, world)` e só lê ou escreve componentes e a interface do `ctx`. Sem `new` no caminho quente: reuse objetos no módulo.
3. Chame o sistema em `fixedStep` ou, se for visual, em `renderScene`.
4. Se outro sistema precisar saber do resultado, emita um evento tipado em `GameEvents`. Não importe a outra feature.
5. Cubra a parte pura com um teste em `src/tests`.

## Como adicionar uma feature

1. Ponha o dado em `src/content`, com schema Zod. O `parse` roda na carga do módulo.
2. Spawne entidades em `src/game/features/<nome>`. Use `ctx.renderer` e `ctx.physics`. Guarde o id numérico em `RenderRef` e `PhysicsRef`.
3. Geometria e material novos passam por `ctx.assets.track` dentro do adaptador de render, que já faz isso para as malhas que ele cria.
4. Ligue o spawn em `src/app/bootstrap.ts`.

## Dono da memória

`AssetManager` guarda tudo que tem `dispose()`. `ThreeRenderer` registra geometria e material. `RapierPhysics.dispose` libera o mundo WASM. O input remove os listeners em `dispose`. Não há singleton global.
