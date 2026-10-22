# Correções da revisão de 2026-10-21 — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o build verde com um portão que impede regressão, e corrigir os defeitos achados na revisão completa: input, ciclo de vida do jogador, tráfego e pedestres, geração do mapa, servidor e desempenho.

**Architecture:** Oito fases, uma branch e um PR por fase, todas saindo de `master`. A Fase 0 vem primeiro porque as outras precisam de `typecheck`, `lint` e `test` passando. As Fases 1 a 5 são independentes entre si. A Fase 6 mexe nos mesmos arquivos da Fase 3 e vem depois dela. A Fase 7 fecha com arquitetura e testes.

**Tech Stack:** TypeScript 6 (`strict`, `exactOptionalPropertyTypes`), Vitest 5, Zod 4, Three 0.186, Rapier 0.21, bitECS 0.4, `ws` 8.

## Decisões já tomadas

- UAZ fica em **130 km/h**. O teste e `docs/ASSETS.md` mudam, os dados não.
- Servidor: **limites de sanidade**, não simulação autoritativa. Velocidade e teleporte limitados, recarga de soco no servidor, `maxPayload`, limite de mensagens por socket, checagem de Origin.
- Binários: **Git LFS daqui para a frente** (`.gitattributes`). O histórico e as mensagens já publicadas não são reescritos.

## Global Constraints

- O tronco é `master` (`main` só tem o commit inicial). Cada fase sai de `master` atualizada, depois do merge da fase anterior quando houver dependência.
- Branches: `fix/build-green`, `fix/input-render`, `fix/player-lifecycle`, `fix/traffic-peds`, `fix/map-placement`, `fix/server-limits`, `perf/hot-paths`, `chore/architecture-tests`.
- Ao fim de cada fase: `pnpm typecheck`, `pnpm lint` e `pnpm test` verdes, e uma volta manual com `pnpm play` no que a fase tocou.
- Testes em `src/tests`, ambiente `node`. A parte pura de cada correção ganha teste. O que depende de DOM ou WebGL é verificado à mão, e o passo diz o que observar.
- Sem `new` no caminho quente (ARCHITECTURE.md). Objetos de rascunho ficam no módulo.
- Mensagens de commit no estilo do repositório: frase em português dizendo o efeito. Conferir `git config --get commit.template` antes do primeiro commit: dois commits (`79c2178`, `10473ca`) saíram com a mensagem `fix(dispositivo): STS-2235 …` de outro projeto.
- Os números de linha abaixo são da revisão e podem ter andado. Localize pelo símbolo.

---

## Fase 0 — Build verde e portão (`fix/build-green`)

### Task 0.1: Erro de tipo em `spawnVehicle`

**Files:** Modify `src/game/features/vehicles/spawn-vehicle.ts`

- [x] `paint` vem de `trafficCatalog.find(...)` e pode ser `undefined`. Trocar `tint: paint?.color` por `...(paint ? { tint: paint.color } : {})`.
- [x] Run: `pnpm typecheck` — Expected: sem erros.

### Task 0.2: ESLint varre `tmp/` e `.worktrees/`

**Files:** Modify `eslint.config.js`

- [x] Em `ignores`, acrescentar `'tmp/**'`, `'.worktrees/**'`, `'.superpowers/**'`, `'coverage/**'`.
- [x] Tirar `parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }` do bloco `files: ['**/*.ts']` e pô-lo num bloco sem `files`, logo depois de `recommendedTypeChecked`.
- [x] Acrescentar `{ files: ['**/*.{js,mjs,cjs}'], ...tseslint.configs.disableTypeChecked }`.
- [x] Run: `pnpm lint` — Expected: 0 problemas, mesmo com a worktree `car-entry` presente.

### Task 0.3: Teste da UAZ

**Files:** Modify `src/tests/cars.test.ts`, `docs/ASSETS.md`

- [x] `expect(carById('uaz').maxSpeedKmh).toBe(130)`. Conferir se o mesmo teste afirma algo sobre torque ou massa da UAZ e alinhar com `src/content/cars.ts`.
- [x] Em `docs/ASSETS.md`, "A UAZ fica a 120 km/h" passa a 130.
- [x] Run: `pnpm test` — Expected: 162/162.

### Task 0.4: Portão local

**Files:** Modify `.husky/pre-commit`, `package.json`, `pnpm-workspace.yaml`

- [x] `.husky/pre-commit`: depois do `lint-staged`, rodar `corepack pnpm typecheck` e `corepack pnpm test`.
- [x] `lint-staged`: os dois globs casam `.ts` e correm em paralelo no mesmo arquivo. Passar a:
  ```json
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"],
    "*.{css,md,json}": "prettier --write"
  }
  ```
- [x] `pnpm-workspace.yaml`: substituir o texto de exemplo por `esbuild: true` (o Vite precisa do binário).
- [x] Verificar: um commit com erro de tipo proposital é barrado. Desfazer depois.

### Task 0.5: CI

**Files:** Create `.github/workflows/ci.yml`

- [x] Em `push` e `pull_request` para `master`: checkout, `pnpm/action-setup`, Node 22 com cache de pnpm, `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- [x] Verificar: o PR desta fase roda o job e passa.

### Task 0.6: LFS e README

**Files:** Create `.gitattributes`, `README.md`

- [x] `.gitattributes`: `*.glb`, `*.gltf`, `*.hdr` com `filter=lfs diff=lfs merge=lfs -text` (texturas JPG pequenas ficam fora). Como o husky é dono de `core.hooksPath`, os ganchos do LFS (`pre-push`, `post-checkout`, `post-commit`, `post-merge`) ficam em `.husky/`, e não se usa `git lfs install`. Os arquivos que já estão no histórico ficam como estão. Só arquivos novos ou alterados vão para o LFS.
- [x] `README.md` curto: o que é, `pnpm install`, `pnpm dev`, `pnpm server`, `pnpm play`, `pnpm test`, e um link para `docs/ARCHITECTURE.md`.

---

## Fase 1 — Input e render (`fix/input-render`)

Testes do input em `src/tests/browser-input.test.ts` (7), com `window`, `document` e o canvas falsos que guardam os listeners. Os 7 falham com o `browser-input.ts` antigo. O render não roda em Node: as Tasks 1.5–1.7 e 1.9 ficam para conferir jogando.

### Task 1.1: O jogo engole teclas digitadas no menu

- [x] `isTypingTarget` (input, textarea, select ou editável; por duck typing) e o `keydown` sai cedo quando o alvo é um deles: nada de `preventDefault`, nada de tecla registrada.

### Task 1.2: Teclas do menu disparam ao continuar

- [x] `Input.reset()` limpa teclas seguradas e apertadas, o toque pesado, o mouse e o zoom. `bootstrap.ts` chama ao pausar e ao continuar.

### Task 1.3: Tecla presa depois de alt-tab

- [x] `blur` da janela e `visibilitychange` para `hidden` chamam `reset()`. Os dois saem no `dispose`.

### Task 1.4: Toque pesado curto e promessa do pointer lock

- [x] O tempo do S é marcado no `keydown` e o toque é decidido no `keyup`, latchado até o fim do quadro. Antes o relógio só começava quando um quadro via a tecla.
- [x] `lockPointer` engole a rejeição do `requestPointerLock` (Chrome recusa o relock logo depois do Esc).

### Task 1.5: Animação passa pela pose de bind

- [x] `playClip` não chama mais `stopAllAction()` (só no `die`, que congela no fim). O clipe novo entra com peso 1 e `crossFadeFrom` o anterior em 0,12 s.
- [x] Conferir jogando: andar → correr → parar → socar sem T-pose no meio.

### Task 1.6: Texturas e contexto WebGL vazam ao reiniciar

- [x] `preloadModel` registra cada textura dos materiais (sem repetir) no `AssetManager`.
- [x] `dispose` libera os `InstancedMesh`, chama `renderer.dispose()` e `forceContextLoss()`.
- [x] Conferir: cinco reinícios pelo menu sem "Too many active WebGL contexts" no console.

### Task 1.7: Aros das rodas recebem a cor da carroceria

- [x] `tintPaint` pula malhas com `wheel`, `rim`, `tire` ou `tyre` no nome delas ou de um pai, a mesma regra de `dressCar`.
- [ ] Conferir: carros de tráfego coloridos com aros na cor original.

### Task 1.8: `start()` continua depois de `stop()`

- [x] `own(cleanup)` registra a limpeza ou roda na hora se a sessão já parou, e `start` sai depois de cada `await` (`connectRoom`, `createRapierWorld`, carga dos modelos) se `running` ficou falso.

### Task 1.9: DPR fixo ao trocar de monitor

- [x] `matchMedia('(resolution: Ndppx)')` chama o mesmo `resize` e se registra de novo a cada troca; sai na limpeza da sessão.
- [ ] Conferir: arrastar a janela para um monitor com outra escala deixa o jogo nítido. (O canvas do radar ainda lê o DPR só ao montar.)

---

## Fase 2 — Ciclo de vida do jogador (`fix/player-lifecycle`)

### Task 2.1: Morrer embarcando ou dirigindo deixa o modo errado

**Files:** Modify `src/game/systems/interaction.ts`, `src/game/systems/cash.ts`, `src/game/features/vehicles/spawn-vehicle.ts` · Test: novo `src/tests/player-death.test.ts`

- [x] Teste primeiro, com o mundo de `enter-car.test.ts` e a ordem de `fixedStep` (interação, dinheiro, embarque): morrer na caminhada até a porta e morrer ao volante. Expected nos dois casos: `OnFoot`, `vehicle === 0`, carro livre, nenhum embarque armado, e o corpo volta visível e com vida.
- [x] `abandonRide` em `interaction.ts`: limpa o embarque ou solta o banco (tráfego fica estacionado, carro do jogador fica livre), volta a câmera a pé e emite `player:exited-vehicle`. `cashSystem` chama na hora da morte, antes de `hideBody`. Com o embarque limpo, `boardCarSystem` não tem mais o que fazer, e não precisa checar vida.
- [x] `interactionSystem` ignora `E` com o jogador morto: antes, o corpo escondido podia armar um embarque durante o segundo de respawn.
- [x] Achado no caminho: os arrays de componente são do módulo e sobrevivem ao mundo. `spawnVehicle` não zerava `Vehicle.occupied`, então reiniciar a sessão dirigindo devolvia o mesmo id marcado como ocupado: não dava para entrar no carro e ele ficava sem freio de mão. Agora zera `occupied` e `speed`. O problema geral está na Task 7.5.

### Task 2.2: Embarque sobrevive à troca de mundo

**Files:** Modify `src/app/bootstrap.ts`

- [x] `clearBoard()` em `start`, junto de `resetRemotes`, `resetRemains` e `resetNetRide`.

### Task 2.3: Dinheiro é recolhido na porta, não no carro — descartada

Não é defeito. `vehicleDriveSystem` grava a posição do carro no `Transform` do jogador antes de `cashSystem` no mesmo passo, então a coleta já acontece em volta do carro. A Task 3.10 tira essa dependência da ordem.

### Task 2.4: Missão e HUD leem a entidade 0

**Files:** Modify `src/game/systems/mission.ts`, `src/game/play/read-hud.ts`

- [x] `const ride = Player.vehicle[eid] ?? 0; const target = driving && ride > 0 ? ride : eid;`, como em `player-focus.ts`. Sem teste: com o modo `Driving` o veículo nunca é 0 hoje. É só guarda.

### Task 2.5: Bordas numéricas do HUD

**Files:** Modify `src/game/features/health-bar.ts`, `src/ui/mount-hud.ts` (`formatTime`)

- [x] Barra de vida: `NaN` vira barra vazia.
- [x] `formatTime` arredonda para décimos antes de dividir em minutos, e foi exportada.
- [x] Testes: `health-bar.test.ts` com `NaN` e o novo `hud-time.test.ts` (`59.96 → '1:00.0'`).

---

## Fase 3 — Tráfego e pedestres (`fix/traffic-peds`)

Testes novos em `src/tests/traffic-peds.test.ts`. Cada um falha com a correção dele desfeita (conferido arquivo a arquivo).

### Task 3.1: Pedestres compartilham malha alheia

**Files:** Modify `src/game/features/pedestrians/crowd.ts`

- [x] O laço "far" zera `RenderRef.mesh` de todo pedestre sem slot neste quadro, antes de pular inativos e motoristas.
- [x] Teste: um pedestre pega um slot, vira motorista a 200 m, e perde a referência.

### Task 3.2: Carro estacionado recebe motorista novo

**Files:** Modify `src/game/systems/traffic.ts` (`drive`)

- [x] `return` logo depois de `park()` no beco de mão única.
- [x] Sem teste direto: com a Task 3.9 a cidade não tem mais beco de mão única (o teste do grafo garante), então o caminho só volta se o mapa mudar.

### Task 3.3: Carro de tráfego roubado nunca bate em ninguém

**Files:** Modify `src/game/systems/vehicle-drive.ts`

- [x] `vehicleDriveSystem` pula carros com `Traffic`: `driveStolen` move o carro e é dono da velocidade. Antes, `forwardSpeed` de uma caixa cinemática gravava 0 em `Vehicle.speed` e `hitPlayer` nunca disparava.
- [x] Teste: `Vehicle.speed` de um carro roubado sobrevive ao sistema.

### Task 3.4: Carro roubado mantém a velocidade guardada

**Files:** Modify `src/game/systems/interaction.ts`

- [x] `parkRide` zera `Traffic.speed` e `Vehicle.speed` ao sair e ao morrer. `enterTraffic` zera ao roubar.
- [x] Teste: roubar um carro a 9 m/s deixa a velocidade em 0.

### Task 3.5: Destroço continua dinâmico quando reaproveitado

**Files:** Modify `src/engine/physics/physics-world.ts`, `rapier-world.ts`, `src/game/systems/traffic.ts`

- [x] `demoteKinematic(body)`: zera velocidades e massa extra e volta a `KinematicPositionBased`. `park()` chama sempre (é idempotente) e também zera `Traffic.speed`.
- [x] Teste: um corpo promovido e rebaixado não cai em 1 s de gravidade.

### Task 3.6: Pedestres travam frente a frente

**Files:** Modify `src/game/systems/pedestrians.ts`, `src/game/ecs/components.ts`

- [x] `solidAt` ignora pedestres mortos.
- [x] Campo novo `Pedestrian.stuck`. Em `Walk`/`Cross`, 1,5 s bloqueado volta a `Idle` com espera escalonada pelo id, e o pedestre escolhe outro destino. Mais simples que o desvio de 90° do plano e resolve o travamento.
- [x] Testes: dois pedestres de frente desistem em até 3 s; um pedestre passa por cima de um cadáver.

### Task 3.7: Fuga e `pedestrian:hit` em cadáveres

**Files:** Modify `src/game/systems/pedestrians.ts`

- [x] A checagem de fuga pula mortos. O evento já só saía na transição para `Flee`; o repetido vinha do cadáver alternando `Flee`/`Down`.
- [x] Teste: um carro a 3 m/s parado sobre um cadáver por 1 s não emite nada.

### Task 3.8: Estado sujo ao reaproveitar pedestre

**Files:** Modify `src/game/systems/pedestrians.ts`

- [x] `freshBody` zera `hurt`, `cool`, `swing`, `corpse`, `stuck` e `speed`. `wake`, `attachDriver` e `ejectDriver` usam.
- [x] Teste: um pedestre com `corpse = 4` vira motorista com tudo zerado.

### Task 3.9: Curvas de 90° viram meia-volta

**Files:** Modify `src/game/systems/traffic.ts` (`pickNext`, agora exportado)

- [x] Confirmado e maior que o esperado: com o limiar `dot > 0.2`, 48 pontas de rua de mão dupla davam meia-volta e 3 de mão única caíam no `park()` da Task 3.2. Com `dot > -0.5` (até ~120°), sobram 3 meias-voltas, todas em nós onde a única outra rua é de mão única entrando.
- [x] Testes: curva em L segue a perpendicular; no grafo real, só há meia-volta onde nenhuma rua sai legalmente, e nenhum carro de mão única fica sem saída.

### Task 3.10: Uma fonte só para a posição do jogador

**Files:** Modify `src/game/play/player-focus.ts`, `vehicle-drive.ts`, `traffic.ts`, `pedestrians.ts`, `cash.ts`

- [x] `playerFocus` escreve num objeto do módulo (sem alocar) e devolve `Readonly`.
- [x] `vehicle-drive` não escreve mais o `Transform` do jogador. Tráfego, pedestres e dinheiro (coleta e o que cai na morte) leem `playerFocus`. Rede, câmera, HUD e missão já liam o carro direto.
- [x] Teste: dirigindo a 150 m do corpo, `pedestrianSystem` sozinho mantém o pedestre perto do carro ativo.

---

## Fase 4 — Mapa e conteúdo (`fix/map-placement`)

Medido antes e depois com uma sonda sobre `buildCostaVerde()`:

|                                  | Antes  | Depois                           |
| -------------------------------- | ------ | -------------------------------- |
| Postes                           | 0      | 182                              |
| Lotes                            | 522    | 400                              |
| Pares de prédios sobrepostos     | 205    | 0                                |
| Prédios dentro de rua ou calçada | 58     | 0                                |
| Spawns de bairro fora do asfalto | 0 de 5 | 5 de 5 (1,57 m, meio da calçada) |

### Task 4.1: Postes nunca são colocados

**Files:** Modify `src/content/map/props.ts` · Test `src/tests/city.test.ts`

- [x] O slot sai de `distance` (`(distance - inset) / 12`). Poste a cada 24 m, **num lado só**: com poste nos dois lados as árvores caíam pela metade e o verde urbano ia de ~10% para 5,3%, abaixo do limite do teste. A guarda dos carros estacionados usa o mesmo slot.
- [x] Teste: mais de 100 postes.

### Task 4.2: Spawns no asfalto, dentro do cruzamento

**Files:** Modify `src/content/spawns.ts` (`besideSidewalk`) · Test `src/tests/multiplayer.test.ts`

- [x] Anda até 12 m pela primeira rua do nó (no máximo metade dela) e desloca para `width / 2 + 0.32 + SIDEWALK_WIDTH / 2`, a mesma linha da malha da calçada.
- [x] Teste: cada spawn fica fora do asfalto e dentro da calçada da rua mais próxima, a mais de 9 m de qualquer nó.

### Task 4.3: Prédios sobrepostos e em cima da rua

**Files:** Modify `src/content/map/blocks.ts` · Test `src/tests/city.test.ts`

- [x] `rectsOverlap` (SAT 2D, mesma convenção de eixos dos colliders e de `boxExit`) exportado de `blocks.ts`. Cada lote é recusado se cruza um lote aceito ou a faixa de uma rua com as calçadas. Paredes-meias encostam exatamente e passam pela folga de 0,1 m.
- [x] Lote de esquina que esbarra tenta 6 m de profundidade antes de desistir. Sem isso sobravam 366 lotes; com isso, 400. Os 122 que saíram estavam empilhados em outros.
- [x] Testes: nenhum par se cruza, nenhum lote na faixa de rua, e casos simples de `rectsOverlap` (encostar não conta, girado 90° troca os eixos).

### Task 4.4: `content` importa `engine`

**Files:** Modify `docs/ARCHITECTURE.md`, `eslint.config.js`

- [x] ARCHITECTURE.md: "`content` só importa `engine/core/math`, que é puro e sem dependências."
- [x] ESLint em `src/content/**`: bane Three, Rapier e, por regex, `app`, `game`, `ui`, `net` e todo `engine` exceto `engine/core/math`. Conferido com um arquivo de prova: barra `game` e `engine/core/context`, deixa `engine/core/math`. (Padrões com `!` não funcionaram para reabrir o caminho.)

### Task 4.5: Catálogo de carros sem schema

**Files:** Modify `src/content/cars.ts` · Test `src/tests/cars.test.ts`

- [x] Schema Zod no próprio `cars.ts` (como `roads.ts`, para não criar ciclo com `schemas.ts`): `id` em `carIds`, torque 0–100, velocidade e escala positivas, e cada id exatamente uma vez.
- [x] Teste: os ids do catálogo são exatamente `carIds`.

### Task 4.6: Radar desfocado e pegadas distorcidas

**Files:** Modify `src/ui/radar-map.ts`, `src/ui/mount-hud.ts`

- [x] `stamp` desenha o polígono dos quatro cantos no mundo passados por `atlasPixel`, em vez de girar no espaço de pixel (anisotrópico e com V invertido).
- [x] O buffer do canvas tem o tamanho da área de conteúdo (180 − 2 × 4 px de borda) e o desenho de 180 unidades é escalado para dentro. `RADAR_BORDER` em `mount-hud.ts` acompanha a borda de `hud.css`.
- [x] Verificar jogando: prédios inclinados no radar mantêm a forma e o radar fica nítido. Reamostrar o DPR ao trocar de monitor fica com a Task 1.9.

### Task 4.7: Scripts

**Files:** Modify `scripts/validate-vehicle.ts`, `scripts/play.mjs`

- [x] `validate-vehicle`: primitiva sem índice conta `POSITION.count / 3`. Os limites passam pela matriz de mundo de cada nó (TRS ou `matrix`, a partir das raízes da cena). Antes, a BMW media 205 × 504 × 255 m e a Ferrari saía com os eixos trocados; agora 2,04 × 2,72 × 4,75 m e 2,24 × 1,21 × 4,57 m.
- [x] `play.mjs`: só encerra processos `node` nas portas 6969 e 8787; outro programa interrompe com mensagem. Um filho que sai por sinal também derruba o outro.

### Task 4.8: Carro do spawn nasce fora da rua

**Files:** Modify `src/content/spawns.ts`, `src/app/bootstrap.ts` · Test `src/tests/overlap.test.ts`

- [x] `parkedBehind` (7 m ao sul, virado para o sul, qualquer que fosse a rua) saiu. Nos 54 pontos de partida do solo (ponto solo e cada bairro, com os cantos do sorteio de ±5 m), ele punha o carro fora do asfalto em 48 e dentro de prédio ou carro estacionado em 25.
- [x] `parkOnStreet(city, jogador, meia-caixa do carro)`: a rua mais próxima com pelo menos 10 m livres de cada nó; encostado no meio-fio do lado do jogador (0,35 m do asfalto); virado no sentido do tráfego daquele lado (mão direita). Desliza pelo meio-fio (0, ±3, ±6 … ±25 m) até não cruzar collider de prédio ou de carro estacionado nem o jogador. Na prática fica a 2,5–2,8 m do jogador.
- [x] Os testes que usavam `parkedBehind` só como lugar fixo do carro ganharam um `carSpot` local.
- [x] Testes, nos 54 pontos de partida: o carro inteiro dentro do asfalto, alinhado com a rua e longe dos cruzamentos; sem cruzar prédio, carro estacionado ou o jogador; virado com o tráfego do seu lado.

---

## Fase 5 — Servidor (`fix/server-limits`)

Testes novos em `src/tests/server-limits.test.ts` (15) e `src/tests/net-client.test.ts` (3). Os casos de `multiplayer.test.ts` montam cenas (jogador posto por pose, socos em rajada) e criam a sala com `limits: false`; o padrão é `true`. Conferido também com o servidor de verdade e clientes `ws`: Origin estranho → HTTP 401; 20 KB → fecha com 1009; 400 mensagens de uma vez → fecha com 1008; teleporte de 300 m → anda 6 m e o cliente volta.

### Task 5.1: Transporte

**Files:** Create `src/net/limits.ts` · Modify `server/index.ts`

- [x] `maxPayload: 16 KiB` e `verifyClient` com `originAllowed`: aceita `http://localhost:6969`, `http://127.0.0.1:6969`, o que vier em `BAIRRO_ORIGINS`, e conexões sem Origin (ferramentas fora do browser). README explica a variável.
- [x] Balde por socket: 60 mensagens/s, rajada de 120. Acima disso descarta; 240 descartes em 5 s fecham com 1008.

### Task 5.2: Posição informada pelo cliente

**Files:** Modify `src/net/room.ts` (`pushPose`)

- [x] Orçamento de alcance em vez de "velocidade × tempo desde a última pose + folga": a folga por mensagem deixava andar ~216 m/s mandando 60 poses por segundo. O orçamento enche na velocidade máxima (a pé `sprintSpeed × 1,5`; no carro o `maxSpeedKmh` do carro × 1,25), guarda no máximo 0,5 s, e cada pose gasta o que andou. Pose além disso anda só até onde o orçamento deixa.
- [x] A pé, passar mais de 5 m do permitido aumenta `placeSerial` com a posição do servidor: o cliente volta para lá (o `applyNetState` já fazia isso no respawn).
- [x] `steerCar`, soco e coleta usam a posição já limitada.

### Task 5.3: Soco sem recarga

**Files:** Modify `src/net/room.ts` (`pushPunch`)

- [x] Um soco por golpe: o próximo só conta depois da duração do golpe atual (`punchProfile`: 0,42 s leve, 0,92 s pesado), menos um tick de folga.
- [x] Testes: 40 pesados de uma vez → um golpe; leves no ritmo do golpe → todos contam; leve logo depois de um pesado → ignorado.

### Task 5.4: NPCs não renascem

- [x] `killNpc` agenda a troca para 30 s depois. O morto sai da lista e entra um NPC novo, com id novo, num nó a pelo menos 60 m de todo jogador.

### Task 5.5: Drops eternos, `hitAt` crescendo, tropeço por antecipação

- [x] Drops vencem em 60 s; a sala guarda no máximo 64 e descarta os mais antigos.
- [x] `hitAt` apaga as entradas mais velhas que `RAM_GAP` a cada atropelamento.
- [x] `carPathBlocked` só para o carro; ninguém cai por onde o carro ainda não chegou.

### Task 5.6: Nomes

- [x] Corta por ponto de código (um emoji não parte ao meio) e tira controles C0/C1, marcas de direção (U+202A–202E, U+2066–2069), larguras zero e BOM.

### Task 5.7: Cliente

**Files:** Modify `src/game/features/net/remotes.ts`, `src/net/session.ts`, `src/engine/core/context.ts`, `src/ui/mount-hud.ts`, `src/ui/hud.css`, `src/app/bootstrap.ts`, `src/game/systems/net.ts`

- [x] O renderer não tem como remover malha, então o fantasma que some vai para uma lista de reserva por modelo e é reaproveitado pelo próximo id. 50 corpos e drops seguidos não criam malha nova. `lastHealth`/`hurtUntil` esquecem o NPC que saiu.
- [x] Corpo de jogador usa o modelo do jogador. (Na prática já saía igual: `citizens[0]` é o mesmo arquivo e o servidor manda variante 0. Ficou explícito.)
- [x] `NetLink.connected()`; a sessão marca a queda depois do `welcome`, e o HUD mostra "Conexão com a sala perdida · crase volta ao menu".
- [x] `resetNet` zera `poseWait` no começo da sessão. `rideEid` não vazava: cada sessão cria mundo, física e renderer novos, e `resetNetRide` já zera o id.

### Task 5.8: Custo por tick

- [x] `encodeStates` serializa NPCs, carros, drops, corpos e lista de jogadores uma vez por tick; cada membro recebe essa parte mais o seu `self` e os outros jogadores. `snapshot` continua igual para os testes; um teste confere que as duas saídas batem.
- [x] Sala vazia não simula.

---

## Fase 6 — Desempenho no caminho quente (`perf/hot-paths`)

Medido com uma sonda (fora do repositório) que roda `trafficSystem` + `pedestrianSystem` na cidade real com 120 pedestres e 40 carros, e outra que roda o `tick` de uma sala com 100 NPCs e 40 carros. Perfil pelo `node:inspector` dentro do teste.

|                                        | Antes      | Depois  |
| -------------------------------------- | ---------- | ------- |
| Tráfego + pedestres por passo (60 Hz)  | 3,2–3,8 ms | 0,71 ms |
| `tick` de uma sala do servidor (20 Hz) | 3,3–3,5 ms | 0,9 ms  |

O perfil mudou a ordem do plano: o custo não era pedestre contra pedestre, era varrer **todos** os colliders da cidade por pedestre e por carro a cada passo (`solidAt` 30%, `buildingPush` + `hitsBuilding` 25%).

### Task 6.1: Grade de colliders

**Files:** Create `src/game/play/collider-grid.ts` · Modify `pedestrians.ts`, `traffic.ts`, `recover-vehicle.ts`, `src/net/room.ts` · Test `src/tests/spatial-grid.test.ts`

- [x] `tallBoxesNear(boxes, x, z, alcance)`: caixas altas (`hy ≥ 0,4`) numa grade de 16 m, montada uma vez por lista de colliders (`WeakMap`), cada caixa registrada pelo círculo que a envolve; consulta sem repetição (carimbo por consulta) e sem alocar.
- [x] Troca as sete varreduras (pedestre, tráfego, recuperação de carro, sala do servidor). O servidor usa a mesma grade.
- [x] De quebra: o pedestre filtrava por `distância do centro > 24 m`, sem somar o tamanho da caixa; caixas grandes (o muro do mar) ficavam de fora. A grade usa o círculo da caixa.
- [x] Teste: em 300 pontos sorteados, a grade devolve toda caixa alta que pode tocar o círculo, e nenhuma baixa; caixa em várias células volta uma vez.

### Task 6.2: Consultas e buscas repetidas

**Files:** Modify `src/game/ecs/queries.ts`, `pedestrians.ts`, `traffic.ts` · Create `src/game/play/crowd-grid.ts`

- [x] `query()` do bitecs monta e confere um hash a cada chamada (com `find`/`filter`), e os sistemas chamavam dentro de laços por pedestre. Como nenhuma entidade é removida (tudo é pool), cada consulta guarda por mundo o array vivo que o bitecs devolve.
- [x] `driverOf` usa um índice carro → motorista, conferido e refeito pela busca se estiver velho.
- [x] `solidAt` lê o yaw do carro direto do quaternion, sem montar objeto.
- [x] `crowd-grid`: pedestres ativos numa grade de 4 m, preenchida uma vez por passo (o tráfego monta, os pedestres reaproveitam). A consulta soma 1 m de folga (um passo ou o empurrão de um soco), então acha todo mundo que a varredura acharia. `solidAt` e `laneBlocked` usam.
- [x] Os testes de `traffic-peds` passam a avançar `ctx.time.tick` a cada passo, como o laço do jogo.
- [x] Teste: com todos andando até 0,7 m depois de preencher a grade, toda consulta acha quem está no alcance.
- [ ] Não feito: alocações pequenas de `boxExit`, `pickNext` e das closures de `interaction.ts`. Depois das mudanças acima o coletor de lixo fica abaixo de 2% do perfil; não compensa.
- [ ] Não feito: `sampleHeight` (~14% agora) calcula a altura analítica, com distância à costa, a cada chamada. Trocar por grade interpolada muda as alturas; fica para quando precisar.

### Task 6.3: HUD por quadro

**Files:** Modify `src/ui/street-route.ts`, `src/ui/mount-hud.ts` · Test `src/tests/street-route.test.ts`

- [x] `createRouteCache`: planeja de novo só quando o alvo muda ou o jogador andou 2 m; entre isso, só o primeiro ponto segue o jogador.
- [x] Textos do HUD só são escritos quando mudam.
- [x] `setPresence` lê o tamanho da tela antes de reescrever a lista de jogadores (antes forçava layout síncrono a cada quadro).

### Task 6.4: Render

**Files:** Modify `src/engine/render/three-renderer.ts`, `src/engine/render/materials/material-library.ts`

- [x] `tick` só atualiza mixers de malhas visíveis: os slots de pedestre, corpos e fantasmas escondidos paravam de animar à toa.
- [x] Sai o atributo `uv2` (three r152+ lê o AO no canal 0, o mesmo `uv`).
- [ ] Não feito: `renderer.project` com parâmetro de saída, `stepAimCursor` e a presença em `bootstrap.ts`. Algumas alocações por quadro, não por entidade; ficaram fora do perfil.

---

## Fase 7 — Arquitetura e testes (`chore/architecture-tests`)

### Task 7.1: Tipos de jogo em `engine/core`

- [x] Nenhum arquivo de `engine/` usava `context.ts`: ele é o saco de dependências do jogo. Foi inteiro para `src/game/context.ts` (`GameContext`, `GameEvents`, `DebugState`, o contrato da rede). 36 imports atualizados; ARCHITECTURE.md diz onde ele mora.

### Task 7.2: Sistemas que se chamam

- [x] `attachDriver`, `seatDriver`, `ejectDriver`, `releaseDriver`, `freshBody` e o pool livre (`idlePedestrian`) foram para `play/drivers.ts`. Tráfego e interação não importam mais o sistema de pedestres.
- [x] Sentar e levantar (`boardVehicle`, `leaveVehicle`, `abandonRide`) foram para `play/seat.ts`. `interaction.ts` só escolhe o carro mais perto; embarque, rede e morte usam `seat`.
- [x] `yawFromQuat`, `chaseCameraYaw` e `compassHeading` em `play/heading.ts`; `capsuleFloor` em `play/ground.ts`; `boardingClip` em `play/board-state.ts`.
- [x] `Mode` e o novo `TrafficMode` em `ecs/components.ts`. Os números `MODE_*` repetidos em três sistemas (`MODE_PARKED = 4` em dois lugares) saíram.
- [x] Nenhum sistema importa outro sistema, fora `ped-ai` e `traffic-ai`, que são regras puras. `play/drivers.ts` lê `PedState` de `ped-ai` pelo mesmo motivo.
- [x] `cash.ts` continua chamando `hideBody`/`showBody` de `features/player` e `layLocalCorpse` de `features/corpse`: são o que spawna e esconde o corpo, como `net.ts` já fazia. A regra do ARCHITECTURE.md é entre features.

### Task 7.3: Regras do ESLint cobrindo o documento

- [x] Three e Rapier barrados também em `src/app`, `src/ui`, `src/net` e `server`. Conferido com um import de prova em cada um (o de `server` dentro do próprio `index.ts`, que é o único arquivo do tsconfig do servidor).

### Task 7.4: Testes dos sistemas sem cobertura

- [x] `systems.test.ts`: o carro acelera com acelerador e o vazio fica no freio de mão; o stream monta os blocos em volta do carro e não do corpo na porta; a missão pega a caixa a pé e termina com o carro no pad; o pool de tráfego enche e a maioria anda pela rua; a multidão acorda perto do jogador e sai para os destinos.
- [x] `player-query.test.ts`: a consulta acha o jogador completo e pula o incompleto, vê quem nasce depois da primeira consulta (o cache da Fase 6) e separa dois mundos.
- [x] `boot-island.test.ts`: um raio para baixo no ponto solo acerta o heightfield na altura do terreno. Ver Task 7.6 para o navmesh.
- [x] `sky.test.ts` fica: confere que a direção do sol calculada continua normalizada.

### Task 7.5: Componentes sujos entre sessões

- [x] `createGameWorld` zera todos os arrays de componente (`clearComponents`). Teste em `world-reset.test.ts`.

### Task 7.6: O navmesh das calçadas estava em pedaços (`fix/sidewalk-nav`)

Achado na Task 7.4: 794 quads viravam **572 grupos** desconectados (o maior com 8 polígonos), e em 98 pares de calçada a menos de 80 m nenhum caminho era achado. Os pedestres nunca usavam o navmesh.

- [x] Causa, em duas partes. (1) O `three-pathfinding` só liga polígonos com vértices em comum, e calçada, faixa e esquina são peças separadas. (2) Mesmo ligando por proximidade, sobravam 47 grupos com 1 m de tolerância: as calçadas param onde começa o quadrado de asfalto do cruzamento, e **as esquinas não tinham peça nenhuma** (entre avenida e rua o buraco chega a 2–3 m).
- [x] `road-mesh.ts`: uma peça de esquina por par de ruas vizinhas em volta de cada nó, ligando o fim de uma calçada ao fim da seguinte (fora de curvas acima de 190°, que cortariam o meio do cruzamento). A peça é o fecho convexo dos quatro pontos; esquinas agudas dobravam o quadrilátero. São 170 peças novas.
- [x] `engine/nav/quad-graph-nav.ts` no lugar do adaptador do `three-pathfinding`: quads a menos de 0,3 m (a faixa para 2 cm antes da calçada) são vizinhos; A\* entre centros com heap; o caminho passa pelo ponto entre um quad e o próximo e termina no alvo. Mesma interface `NavMesh`. A dependência `three-pathfinding` saiu, e o ESLint passa a barrar Three em `engine/nav`.
- [x] Medido: 964 quads num grupo só, todos convexos; todos os pares de calçada a menos de 80 m acham caminho (~0,04 ms por busca, 26 ms para montar). Rodando a multidão real por 20 s, 1674 de 1674 amostras de pedestre andando seguem um caminho do navmesh (antes, 0).
- [x] Testes em `nav.test.ts` (distância entre quads, caminho por peças, sem caminho através de buraco largo ou para fora da calçada, cidade convexa e conectada, caminho até o alvo para pares próximos). `boot-island` perde o `.fails`.

---

## Fase 8 — Pendências da revisão (`fix/remaining-gaps`)

- [x] **Carro do jogador machuca pedestres no solo.** `carImpactDamage` só era usado na sala; no solo o carro só assustava. `ramPedestrians` testa a caixa do carro contra o círculo de cada pedestre por perto, com a mesma curva de dano e o mesmo intervalo de 0,6 s por pessoa (`Pedestrian.rammed`, zerado com o mundo). Teste em `traffic-peds.test.ts`; a batida devagar não machuca, a de 12 m/s tira o mesmo que no servidor, a segunda dentro do intervalo não conta, a de 20 m/s mata.
- [x] **Radar acompanha a escala da tela.** O buffer do canvas do radar é refeito quando muda o `devicePixelRatio`, como o canvas do jogo.
- [x] **Achado no teste de navegador: a pintura da pista nunca era desenhada.** O shader de UV por metro recebia `1 / TILE_METERS` como número cru; a faixa (`lane: 1`) virava `gtW.xz * 1`, e GLSL ES não converte int para float. O shader não compilava (erro no console e "program not valid" a cada quadro), e faixas e faixas de pedestre sumiam em qualquer GPU. `glslFloat` escreve sempre um literal float; teste em `uv-meters.test.ts`.
- [x] **Portão local conferido:** um commit com erro de tipo é barrado pelo pre-commit e o HEAD não anda.
- [x] **Teste no navegador** (Chrome headless pelo DevTools Protocol, WebGL por SwiftShader):
  - 6 inícios seguidos pelo menu: sempre 2 canvases (jogo e radar), nenhum aviso de contexto WebGL, nenhum erro além do favicon ausente (404).
  - Andar, correr e parar fotografados a 40–400 ms das trocas: sem T-pose.
  - Carro do spawn ao lado do jogador, na rua; radar nítido; faixas e postes visíveis depois do conserto do shader; pedestres andando na calçada.
  - Teclas reais "wasd " chegam ao campo de nome. No menu de pausa o multijogador fica escondido, então o cenário da revisão (digitar o nome com o jogo rodando) não acontecia; a proteção continua valendo para o `select` das configurações.
  - Um início falhou uma vez com o erro do Rapier "attempted to take ownership of Rust value while it was borrowed", com a máquina a 1 GB de RAM livre. Não se repetiu em 7 inícios depois de liberar memória; fica anotado.
- [ ] Ainda para conferir à mão: aros dos carros de tráfego (nenhum carro colorido no quadro), trocar de monitor com outra escala, e duas abas na mesma sala.
- [ ] Decisão de design, não feita: missão que recomeça e paga recompensa.

## Ordem sugerida e tamanho

| Fase                   | Depende de | Tamanho           |
| ---------------------- | ---------- | ----------------- |
| 0 Build verde          | —          | P (meio dia)      |
| 1 Input e render       | 0          | M                 |
| 2 Ciclo de vida        | 0          | P                 |
| 3 Tráfego e pedestres  | 0          | M–G               |
| 4 Mapa                 | 0          | M (4.3 é a maior) |
| 5 Servidor             | 0          | G                 |
| 6 Desempenho           | 3          | M                 |
| 7 Arquitetura e testes | 2, 3, 6    | M                 |

As Fases 1, 2, 4 e 5 podem andar em paralelo, em worktrees separadas.
