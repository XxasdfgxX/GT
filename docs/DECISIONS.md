# Decisões

Formato curto. Cada item é a escolha feita no Marco 1 quando a spec deixava mais de um caminho.

## ADR-1 — Personagem cinemático

O corpo do jogador é uma cápsula kinematic com `KinematicCharacterController`. A gravidade e o pulo vivem no componente `Velocity`. O corpo dinâmico empurrava o carro e complicava o pulo. A cápsula não gira na física; a malha usa o yaw da velocidade.

## ADR-2 — Uma câmera de órbita

A pé e no carro é o mesmo rig. Mudam distância e altura do pivô. O yaw segue o mouse e não se alinha sozinho com o carro, para o olhar continuar livre ao dirigir. WASD no chão é relativo a esse yaw. No carro, W/S e A/D são acelerador, freio e esterço.

## ADR-3 — Input amostrado uma vez por quadro

Pulo e `E` são borda de tecla e ficam latched no componente até o sistema gastar. Segurar espaço no carro é freio de mão (nível), não pulo. O rato só vale com pointer lock, pedido no clique do canvas.

## ADR-4 — Malhas procedurais

O Marco 1 não carrega glTF. Chão, prédios, jogador e carro são primitivas. `AssetManager` existe para ser o dono do `dispose`. O carregador de manifest fica para um marco com modelos. Ver `docs/ASSETS.md`.

## ADR-5 — Áudio mudo

`AudioBus` está na interface e a implementação não cria nós. Nada de gameplay depende de som.

## ADR-6 — Prédios instanciados

Dois protótipos (`house`, `block`) viram dois `InstancedMesh`. Cada prédio ainda tem um collider estático próprio. O chão é uma caixa visual alinhada ao collider.

## ADR-7 — Carro

`DynamicRayCastVehicleController`, tração atrás, direção na frente. Eixo frontal local é +Z. `steerSign: -1` faz a tecla A virar à esquerda. Ré entra quando S está premido e a velocidade para a frente é menor que 0,4 m/s. Freio mais forte nas rodas de trás para a frente não cravar no chão. Massa, suspensão, freio e força do motor estão em `content/vehicles.ts`. O centro de massa e o amortecimento angular ficam no adaptador porque são estabilidade do solver, não conteúdo.

## ADR-8 — bitecs 0.4

Componentes são SoA em `Float32Array` / `Uint8Array` com capacidade 1024. O id da entidade é o índice. Objetos Three e Rapier ficam nos adaptadores, apontados por id numérico.

## ADR-9 — TypeScript 6

O `typescript-eslint` atual não analisa TypeScript 7. O projeto usa TypeScript 6, que é o compilador que o lint entende, com `strict` e `exactOptionalPropertyTypes`.

## ADR-10 — Constantes de jogo em `content/sim.ts`

O plano citava `app/config.ts`. Os números de jogo foram para `content` para um sistema não importar `app`. O limite do quadro também está aí e o loop lê desse módulo.

## ADR-11 — Sem sombras

O sol é uma luz direcional mais ambiente. Sombra fica de fora para não aumentar o custo antes de existir uma cidade.
