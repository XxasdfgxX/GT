# Arquitetura

Bairro é um protótipo third-person no browser. O código de jogo não importa Three.js nem Rapier. Cada serviço entra por uma interface e chega nos sistemas por um `GameContext`.

## Camadas

As dependências apontam para dentro:

`app` → `game` → `engine` → APIs do browser

- `app` sobe o canvas, cria os adaptadores e roda o quadro.
- `game` tem componentes, sistemas e o que spawna o jogador, o carro e o mapa. `game/context.ts` define o `GameContext`, os eventos (`GameEvents`), o estado de depuração e o contrato da rede (`NetLink`, `NetSnapshot`).
- `engine/core` tem o relógio, o barramento, o logger e a matemática pura.
- `engine/render`, `engine/physics` e `engine/input` definem a interface e a implementação.
- `content` é dado validado com Zod. `game` e `app` leem esse dado. `content` só importa `engine/core/math`, que é puro e sem dependências. O ESLint barra o resto.
- `sim` tem as regras puras que o jogo e o servidor da sala dividem: colisão de círculos e caixas, dano, faixas e semáforo, carteira. Só importa `content` e `engine/core/math`.
- `net` roda no servidor. De `game` só pega tipos; o que precisa dividir com o jogo mora em `sim`. O ESLint barra o resto.
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

Depois do carro do jogador, o passo fixo anda o tráfego e os pedestres. O streaming de chunks roda no começo do passo. No quadro, a multidão escolhe quem fica com esqueleto e quem vira cápsula instanciada, e só então a malha interpola.

## Cidade

`content/map` gera a ilha: contorno, altura, grafo de ruas, lotes, fachadas e props. Nada disso importa Three.js. `spawnMap` sobe o terreno e a água na hora. O resto entra por chunk de 128 m, no máximo alguns chunks por quadro, e some quando o jogador se afasta (a malha fica escondida e o collider desliga; não é recriado).

O minimapa lê o contorno, a altura, o grafo e as pegadas.

## Tráfego e pedestres

O tráfego é um pool de corpos cinemáticos que seguem a faixa da direita. No impacto do jogador o corpo vira dinâmico e o `EventBus` emite `vehicle:collision`.

Pedestres andam num grafo de quads de calçada, esquina e faixa (`engine/nav/quad-graph-nav.ts`): quads que se tocam são vizinhos, o A* corre entre os centros e o caminho passa pelo ponto entre um quad e o próximo. O jogo só vê a interface `NavMesh`. Estados: idle, walk, wait, cross, flee. `pedestrian:hit` sai quando o carro encosta. Não há missão nem polícia em cima desses eventos.

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
