# Decisões

Formato curto. Cada item é a escolha feita no Marco 1 quando a spec deixava mais de um caminho.

## ADR-1 — Personagem cinemático

O corpo do jogador é uma cápsula kinematic com `KinematicCharacterController`. A gravidade e o pulo vivem no componente `Velocity`. O corpo dinâmico empurrava o carro e complicava o pulo. A cápsula não gira na física; a malha usa o yaw da velocidade.

## ADR-2 — Uma câmera de órbita

A pé e no carro é o mesmo rig. Mudam distância e altura do pivô. O yaw segue o mouse e não se alinha sozinho com o carro, para o olhar continuar livre ao dirigir. As setas no chão são relativas a esse yaw. No carro, seta para cima e para baixo são acelerador e freio, e as laterais esterçam. A câmera não entra em parede: um segmento do pivô à lente é testado contra os colliders dos prédios e a lente para 35 cm antes, nunca a menos de 2 m do jogador (`play/camera-occlusion.ts`).

## ADR-3 — Input amostrado uma vez por quadro

Pulo (`A`), soco (`D`) e interagir (`W`) são borda de tecla e ficam latched no componente até o sistema gastar. `S` segurado corre; tocado, é o soco forte. Segurar espaço no carro é freio de mão (nível), não pulo. O rato só vale com pointer lock, pedido no clique do canvas.

## ADR-4 — Malhas procedurais (substituída)

_Substituída._ No Marco 1 tudo era primitiva. Hoje os personagens, carros e props são glTF (`GLTFLoader` com meshopt), e as superfícies são texturas PBR do Poly Haven. `AssetManager` continua dono do `dispose`. Ver `docs/ASSETS.md`.

## ADR-5 — Áudio procedural

`createWebAudioBus` sintetiza o motor (um oscilador) e as vinhetas de coleta e entrega, e só começa no primeiro gesto do jogador. Nada de gameplay depende de som; os testes usam `createSilentAudioBus`.

## ADR-6 — Prédios instanciados

Cada prédio é uma caixa unitária instanciada, agrupada por chunk e acabamento, com um collider estático próprio. A fachada vem do atributo por instância `facade` (altura do andar, estilo, térreo, semente): o shader desenha andares, vãos, caixilhos, vidro e vitrine pelo tamanho real da parede. Peitoris, sacadas, platibanda, ar condicionado e caixa d'água são caixas no mesmo lote. Seis estilos em `content/map/facades.ts`; a tabela de janelas fica em `engine/render/materials/facade-shader.ts` e um teste garante que as duas concordam.

## ADR-7 — Carro

`DynamicRayCastVehicleController`, tração atrás, direção na frente. Eixo frontal local é +Z. `steerSign: -1` faz a tecla A virar à esquerda. Ré entra quando S está premido e a velocidade para a frente é menor que 0,4 m/s. Freio mais forte nas rodas de trás para a frente não cravar no chão. Massa, suspensão, freio e força do motor estão em `content/vehicles.ts`. O centro de massa e o amortecimento angular ficam no adaptador porque são estabilidade do solver, não conteúdo.

## ADR-8 — bitecs 0.4

Componentes são SoA em `Float32Array` / `Uint8Array` com capacidade 1024. O id da entidade é o índice. Objetos Three e Rapier ficam nos adaptadores, apontados por id numérico.

## ADR-9 — TypeScript 6

O `typescript-eslint` atual não analisa TypeScript 7. O projeto usa TypeScript 6, que é o compilador que o lint entende, com `strict` e `exactOptionalPropertyTypes`.

## ADR-10 — Constantes de jogo em `content/sim.ts`

O plano citava `app/config.ts`. Os números de jogo foram para `content` para um sistema não importar `app`. O limite do quadro também está aí e o loop lê desse módulo.

## ADR-11 — Sombras do sol

_Substituída._ O sol projeta sombra num mapa só (sem cascatas, porque o CSM sobrescreve o `onBeforeCompile` que os materiais da cidade já usam): 4096 px em ±90 m na qualidade alta, 2048 em ±45 m na baixa. Uns 4,4 cm por texel. `PCFShadowMap` com raio 2, porque o r186 tirou o `PCFSoftShadowMap`.

## ADR-12 — Pós-processamento sempre ligado

O `postprocessing` roda em todo quadro, em buffer half-float: `RenderPass`, N8AO (oclusão de ambiente, raio 2 m), bloom e tone mapping ACES, e SMAA no fim. O canvas não usa MSAA. O ajuste "Efeitos" liga e desliga só AO e bloom, sem reiniciar. Céu do Poly Haven parcialmente nublado, névoa exponencial e `scene.environmentIntensity` 1,5 para compensar o céu mais escuro.

## ADR-13 — Texturas 1K em JPG e WebP, por enquanto

Os scans do Poly Haven vêm em 2K e entram em 1K: JPG para as superfícies, WebP dentro dos glTF. KTX2 cortaria a memória de vídeo umas 4 vezes, mas pede `toktx` ou `basisu`, que não estão instalados. Ficam no git normal, como as texturas antigas; os modelos vão pelo LFS.

## ADR-14 — Terreno por mistura

O terreno mistura areia, chão calçado, rocha e grama por um atributo de pesos por vértice (`terrainSplat`), com rocha nas encostas decidida no shader. Mapeamento planar de cima.

## ADR-15 — Estado de sala por vizinhança

O servidor manda pedestres e carros só para quem está a até 220 m deles; carro dirigido por jogador vai para todos. Posições em centímetros e ângulos em milirradianos. `snapshot()` aplica o mesmo filtro, então os testes veem o que vai no fio. Uma sala cheia caiu de 19 KB para ~5 KB por tick. Sem protocolo de diferenças: o cliente já esconde quem sai da lista e encaixa quem volta.

## ADR-16 — Limites do servidor contra clientes ruins

Altura do pose presa ao terreno (até 6 m acima), quem caiu não anda, socket que não lê é cortado depois de 5 s acima de 1 MB no buffer, ping a cada 10 s corta sockets meio abertos, e no máximo 8 sockets por endereço e 64 no processo. O proxy do Vite passa o endereço real (`xfwd`); o servidor só confia em `X-Forwarded-For` vindo do loopback e pega a última entrada.
