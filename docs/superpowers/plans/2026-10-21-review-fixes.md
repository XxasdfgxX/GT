# Correções da revisão de 2026-10-21 — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o build verde com um portão que impede regressão, e corrigir os defeitos achados na revisão completa: input, ciclo de vida do jogador, tráfego e pedestres, geração do mapa, servidor e desempenho.

**Architecture:** Oito fases, uma branch e um PR por fase, todas saindo de `main`. A Fase 0 vem primeiro porque as outras precisam de `typecheck`, `lint` e `test` passando. As Fases 1 a 5 são independentes entre si. A Fase 6 mexe nos mesmos arquivos da Fase 3 e vem depois dela. A Fase 7 fecha com arquitetura e testes.

**Tech Stack:** TypeScript 6 (`strict`, `exactOptionalPropertyTypes`), Vitest 5, Zod 4, Three 0.186, Rapier 0.21, bitECS 0.4, `ws` 8.

## Decisões já tomadas

- UAZ fica em **130 km/h**. O teste e `docs/ASSETS.md` mudam, os dados não.
- Servidor: **limites de sanidade**, não simulação autoritativa. Velocidade e teleporte limitados, recarga de soco no servidor, `maxPayload`, limite de mensagens por socket, checagem de Origin.
- Binários: **Git LFS daqui para a frente** (`.gitattributes`). O histórico e as mensagens já publicadas não são reescritos.

## Global Constraints

- Antes de começar: fazer o merge de `fix/stream-while-driving` em `main` (ou abrir o PR dela). Cada fase sai de `main` atualizada.
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
- [ ] Verificar: um commit com erro de tipo proposital é barrado. Desfazer depois.

### Task 0.5: CI

**Files:** Create `.github/workflows/ci.yml`

- [x] Em `push` e `pull_request` para `main`: checkout, `pnpm/action-setup`, Node 22 com cache de pnpm, `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- [ ] Verificar: o PR desta fase roda o job e passa.

### Task 0.6: LFS e README

**Files:** Create `.gitattributes`, `README.md`

- [x] `.gitattributes`: `*.glb`, `*.gltf`, `*.hdr` com `filter=lfs diff=lfs merge=lfs -text` (texturas JPG pequenas ficam fora). Como o husky é dono de `core.hooksPath`, os ganchos do LFS (`pre-push`, `post-checkout`, `post-commit`, `post-merge`) ficam em `.husky/`, e não se usa `git lfs install`. Os arquivos que já estão no histórico ficam como estão. Só arquivos novos ou alterados vão para o LFS.
- [x] `README.md` curto: o que é, `pnpm install`, `pnpm dev`, `pnpm server`, `pnpm play`, `pnpm test`, e um link para `docs/ARCHITECTURE.md`.

---

## Fase 1 — Input e render (`fix/input-render`)

### Task 1.1: O jogo engole teclas digitadas no menu

**Files:** Modify `src/engine/input/browser-input.ts` · Test: `src/tests/menu-key.test.ts` (ou um novo `browser-input.test.ts`)

- [ ] No `onKeyDown` e no `onKeyUp`, sair cedo quando `event.target` é `HTMLInputElement`, `HTMLTextAreaElement`, `HTMLSelectElement` ou `isContentEditable`. Extrair `isTypingTarget(target)` como função pura para testar sem DOM real: um objeto com `tagName` e `isContentEditable`.
- [ ] Verificar à mão: abrir o menu de pausa, ir em multijogador e digitar um nome com "w a s d" e espaço.

### Task 1.2: Teclas do menu disparam ao continuar

**Files:** Modify `src/engine/input/input.ts`, `browser-input.ts`, `src/app/bootstrap.ts`

- [ ] Acrescentar `reset(): void` à interface `Input`. Ele limpa `keys`, `pressed`, o estado do toque pesado e os deltas do mouse.
- [ ] `bootstrap.ts`: chamar `ctx.input.reset()` ao pausar e ao continuar.
- [ ] Teste: em `loop.test.ts` ou num teste do input, `pressed` com `KeyE` seguido de `reset()` dá um snapshot sem `interact`.

### Task 1.3: Tecla presa depois de alt-tab

**Files:** Modify `browser-input.ts`

- [ ] Ouvir `window` `blur` e `document` `visibilitychange` (quando `hidden`) e chamar `reset()`. Remover os dois listeners em `dispose`.
- [ ] Verificar à mão: segurar ↑ no carro, alt-tab, soltar e voltar. O carro perde o acelerador.

### Task 1.4: Toque pesado curto e promessa do pointer lock

**Files:** Modify `browser-input.ts`

- [ ] A detecção do toque pesado sai de `snapshot()` e vai para os handlers: gravar o tempo no keydown, decidir no keyup e latchar o resultado em `pressed`. Um toque inteiro entre dois quadros conta.
- [ ] `void target.requestPointerLock()` passa a `target.requestPointerLock()?.catch(() => {})` nos dois lugares.

### Task 1.5: Animação passa pela pose de bind

**Files:** Modify `src/engine/render/three-renderer.ts` (`playClip`)

- [ ] Guardar a ação atual por malha. Na troca, `next.reset().play()` e depois `next.crossFadeFrom(prev, 0.12, false)`, sem `stopAllAction()`. Clipes de uma vez (`punch`, `die`) continuam com `LoopOnce` e `clampWhenFinished`.
- [ ] Verificar à mão: andar → correr → parar, sem T-pose no meio.

### Task 1.6: Texturas e contexto WebGL vazam ao reiniciar

**Files:** Modify `three-renderer.ts` (`preloadModel`, `dispose`)

- [ ] Em `preloadModel`, percorrer as propriedades de textura de cada material (`map`, `normalMap`, `roughnessMap`, `metalnessMap`, `aoMap`, `emissiveMap`, `alphaMap`) e registrar cada uma em `ctx.assets.track`, sem repetir.
- [ ] Em `dispose`: `dispose()` nos `InstancedMesh`, depois `renderer.dispose()` e `renderer.forceContextLoss()`.
- [ ] Verificar à mão: cinco reinícios pelo menu, sem aviso "Too many active WebGL contexts" no console.

### Task 1.7: Aros das rodas recebem a cor da carroceria (plausível)

**Files:** Modify `three-renderer.ts` (`tintPaint`)

- [ ] Primeiro confirmar: carregar um carro do tráfego com cor e olhar os aros. Se estiverem pintados, pular nós cujo nome case com `/wheel|rim|tire|tyre/i` e materiais marcados por `dressCar` (`userData.keep = true`).

### Task 1.8: `start()` continua depois de `stop()`

**Files:** Modify `src/app/bootstrap.ts`

- [ ] Depois de cada `await` em `start`, `if (!running) return` e desfazer o que já foi criado. Uma alternativa é um `AbortController` por sessão.

### Task 1.9: DPR fixo ao trocar de monitor

**Files:** Modify `three-renderer.ts`

- [ ] Ouvir `matchMedia(\`(resolution: ${devicePixelRatio}dppx)\`)`com`{ once: true }`e registrar de novo a cada troca. Chamar o mesmo caminho do`resize`.

---

## Fase 2 — Ciclo de vida do jogador (`fix/player-lifecycle`)

### Task 2.1: Morrer embarcando ou dirigindo deixa o modo errado

**Files:** Modify `src/game/systems/cash.ts`, `src/game/systems/board-car.ts`, `src/game/play/board-state.ts` · Test: novo `src/tests/player-death.test.ts`

- [ ] Teste primeiro, com o mundo de `enter-car.test.ts`:
  1. Armar o embarque e avançar até a fase `walk`, depois zerar `Player.health` e rodar `cashSystem` e `boardCarSystem` por 2 s. Expected: `Player.mode === Mode.OnFoot`, `Player.vehicle === 0`, `currentBoard() === null`, e o corpo reaparece em `home`.
  2. A mesma coisa já em `Mode.Driving`. Expected: o mesmo resultado, e o carro fica sem input (acelerador 0, freio de mão).
- [ ] Na hora da morte (o bloco que chama `hideBody`): `clearBoard()`, `Player.mode = OnFoot`, `Player.vehicle = 0`, input do carro zerado. Se for um carro de tráfego roubado, devolver ao estado parado (a Task 3.4 zera a velocidade).
- [ ] `boardCarSystem`: sair cedo se `Player.health <= 0`.
- [ ] `vehicleDriveSystem`: não aplicar input se o motorista está morto.

### Task 2.2: Embarque sobrevive à troca de mundo

**Files:** Modify `src/app/bootstrap.ts` (ou o ponto de teardown do mundo)

- [ ] Chamar `clearBoard()` ao destruir e ao criar um mundo, junto dos outros resets de módulo (`resetNetRide`, `resetRemotes`).

### Task 2.3: Dinheiro é recolhido na porta, não no carro

**Files:** Modify `src/game/systems/cash.ts` (`collect`)

- [ ] Ler a posição com `playerFocus` (ou o carro quando `Mode.Driving`), não com o `Transform` do corpo.
- [ ] Teste: jogador dirigindo, corpo na porta, pickup ao lado do carro a 40 m da porta. Expected: o dinheiro entra.

### Task 2.4: Missão e HUD leem a entidade 0

**Files:** Modify `src/game/systems/mission.ts`, `src/game/play/read-hud.ts`

- [ ] Trocar `Player.vehicle[eid] ?? eid` por `const ride = Player.vehicle[eid] ?? 0; const focus = ride > 0 ? ride : eid;`, como em `player-focus.ts`.
- [ ] Teste em `player-focus.test.ts` ou num novo `read-hud.test.ts`: com `vehicle = 0`, a velocidade lida é a do jogador.

### Task 2.5: Bordas numéricas do HUD

**Files:** Modify `src/game/features/health-bar.ts`, `src/ui/mount-hud.ts` (`formatTime`)

- [ ] Barra de vida: `const ratio = Number.isFinite(h) ? clamp(h / max, 0, 1) : 0`.
- [ ] `formatTime`: arredondar primeiro para décimos (`Math.round(t * 10) / 10`) e só depois dividir em minutos e segundos.
- [ ] Testes: `health-bar.test.ts` com `NaN`. `formatTime(59.96) === '1:00.0'` (exportar `formatTime` se preciso).

---

## Fase 3 — Tráfego e pedestres (`fix/traffic-peds`)

### Task 3.1: Pedestres compartilham malha alheia

**Files:** Modify `src/game/features/pedestrians/crowd.ts`

- [ ] Antes de distribuir os slots próximos, zerar `RenderRef.mesh` de **todo** pedestre que não ficou com slot neste quadro, inclusive inativos e motoristas. A forma mais simples: um laço no começo que zera `RenderRef.mesh` de todos e deixa a atribuição repor os de perto. O laço "far" deixa de zerar.
- [ ] Teste (com um `renderer` falso, como nos testes existentes): pedestre A pega o slot M, vira motorista, e o pedestre B pega M. Expected: `RenderRef.mesh[A] === 0`.

### Task 3.2: Carro estacionado recebe motorista novo

**Files:** Modify `src/game/systems/traffic.ts` (`drive`)

- [ ] Depois de `park(ctx, world, eid)`, dar `return` antes de `place(...)`.
- [ ] Teste: uma aresta de mão única sem saída, com o carro chegando ao fim. Expected: carro inativo, nenhum pedestre `driving=1` apontando para ele.

### Task 3.3: Carro de tráfego roubado nunca bate em ninguém

**Files:** Modify `src/game/systems/vehicle-drive.ts`

- [ ] Quando o veículo dirigido é de tráfego (cinemático), `Vehicle.speed` recebe `Traffic.speed[ride]` e não `forwardSpeed`. Não chamar `setVehicleInput` nem `setEngine` nele.
- [ ] Teste: carro roubado a 10 m/s contra um carro na faixa. Expected: o alvo vira destroço e `vehicle:collision` é emitido.

### Task 3.4: Carro roubado mantém a velocidade guardada

**Files:** Modify `src/game/systems/interaction.ts`

- [ ] Ao sair e ao roubar, `Traffic.speed[ride] = 0`.
- [ ] Teste: sair a 30 m/s e entrar de novo sem acelerar. Expected: a velocidade fica em 0.

### Task 3.5: Destroço continua dinâmico quando reaproveitado

**Files:** Modify `src/engine/physics/physics-world.ts`, `rapier-world.ts`, `src/game/systems/traffic.ts`

- [ ] Acrescentar `demote(body)` à interface: volta a `KinematicPositionBased` e zera velocidades.
- [ ] `traffic.ts`: chamar `demote` em `park()` e na reativação.
- [ ] Verificar à mão: bater num carro, se afastar até o pool reciclar e voltar. Os carros andam sem tremer.

### Task 3.6: Pedestres travam frente a frente

**Files:** Modify `src/game/systems/pedestrians.ts`, `src/game/play/overlap.ts`

- [ ] `solidAt` ignora pedestres com `health <= 0`.
- [ ] Em `Walk` e `Cross`: se `slide` falha por mais de 1,5 s, tentar desviar 90° para a direita por 1 s. Se ainda falhar, sortear um novo destino. Guardar o tempo bloqueado num campo novo do componente `Pedestrian`.
- [ ] Teste em `ped-ai.test.ts`: dois pedestres em rota de colisão, 5 s de simulação. Expected: os dois andaram mais de 1 m.

### Task 3.7: Fuga e `pedestrian:hit` em cadáveres

**Files:** Modify `src/game/systems/pedestrians.ts`

- [ ] A checagem de fuga pula `health <= 0`.
- [ ] `pedestrian:hit` só sai na borda do contato: guardar "em contato no tick anterior".
- [ ] Teste: um carro parado sobre um cadáver a 3 m/s por 1 s. Expected: zero eventos.

### Task 3.8: Estado sujo ao reaproveitar pedestre

**Files:** Modify `src/game/systems/pedestrians.ts` (`attachDriver`, `ejectDriver`)

- [ ] Zerar `corpse`, `cool` e `swing` nas duas funções.
- [ ] Teste: pedestre com `corpse > 0` vira motorista, é ejetado e morre. Expected: cai $10.

### Task 3.9: Curvas de 90° viram meia-volta (plausível)

**Files:** Modify `src/game/systems/traffic.ts` (`pickNext`) · Test `src/tests/traffic-ai.test.ts`

- [ ] Confirmar com um teste num grafo em L: o carro deve seguir a aresta perpendicular. Se falhar, trocar o limiar `dot > 0.2` por "qualquer aresta que não seja a de volta" (`dot > -0.7`), preferindo a mais reta.

### Task 3.10: Uma fonte só para a posição do jogador

**Files:** Modify `src/game/play/player-focus.ts`, `src/game/systems/vehicle-drive.ts`, `sync-transforms.ts`, e quem lê o `Transform` do jogador

- [ ] `playerFocus` devolve um objeto de rascunho do módulo, sem alocar.
- [ ] `vehicle-drive` deixa de escrever o `Transform` do jogador. Todo sistema que quer "onde está o jogador" (stream, tráfego, pedestres, dinheiro, câmera, HUD) usa `playerFocus`. `grep -n "Transform.p[xz]\[player"` acha os pontos.
- [ ] Teste em `player-focus.test.ts`: dirigindo, cada sistema de interesse recebe a posição do carro, independente da ordem em `fixedStep`.
- [ ] Esta task fica por último na fase porque mexe em muitos arquivos.

---

## Fase 4 — Mapa e conteúdo (`fix/map-placement`)

### Task 4.1: Postes nunca são colocados

**Files:** Modify `src/content/map/props.ts` · Test `src/tests/city.test.ts`

- [ ] `distance` vale 10, 22, 34…, então `% 24` nunca dá 0. Usar um índice do laço (`slot`, que conta de 0) e decidir com `slot % 2 === 0`. A guarda dos carros estacionados (`distance % 24 !== 0`) passa a usar o mesmo `slot`.
- [ ] Teste: `buildCostaVerde()` gera mais de 0 postes, e nenhum carro estacionado ocupa o slot de um poste.

### Task 4.2: Spawns no asfalto, dentro do cruzamento

**Files:** Modify `src/content/spawns.ts` (`besideSidewalk`) · Test `src/tests/multiplayer.test.ts` (`bairro spawns`)

- [ ] O deslocamento lateral passa a `edge.width / 2 + 0.32 + SIDEWALK_WIDTH / 2` (o centro da calçada, como em `road-mesh.ts`).
- [ ] Antes do deslocamento lateral, avançar 12 m ao longo da aresta, para fora do nó, limitado à metade do comprimento da aresta.
- [ ] Teste: cada spawn fica a mais de `width / 2` da linha central da aresta mais próxima e fora da caixa de qualquer cruzamento.

### Task 4.3: Prédios sobrepostos e em cima da rua

**Files:** Modify `src/content/map/blocks.ts` · Test `src/tests/city.test.ts`

- [ ] Ao gerar os lotes, manter uma lista dos retângulos já aceitos (OBB 2D) e rejeitar um lote que cruze outro lote ou qualquer aresta de rua (segmento inflado por `width / 2 + SIDEWALK_WIDTH`). Reaproveitar a matemática de `boxExit` / `traffic-ai` se servir, ou escrever um teste SAT 2D puro em `content/map`.
- [ ] Teste: nenhum par de prédios se cruza, e nenhum prédio entra na faixa de rua inflada. A sonda da revisão (`scratchpad/probe/probe.test.ts`) serve de ponto de partida.
- [ ] Conferir a contagem de prédios antes e depois. Se cair muito, diminuir o recuo ou a profundidade, não a checagem.

### Task 4.4: `content` importa `engine`

**Files:** Modify `docs/ARCHITECTURE.md`, `eslint.config.js`

- [ ] Decisão: `engine/core/math` é puro e sem dependências. A regra passa a ser "`content` só importa `engine/core/math`". Atualizar a frase em ARCHITECTURE.md.
- [ ] ESLint: um bloco `files: ['src/content/**/*.ts']` com `no-restricted-imports`, banindo Three, Rapier e os padrões `../../game/*`, `../../app/*`, `../../ui/*`, `../../net/*` e `**/engine/!(core)/**`.

### Task 4.5: Catálogo de carros sem schema

**Files:** Modify `src/content/cars.ts`, `src/content/schemas.ts`

- [ ] Um schema Zod para `carCatalog`: `id` em `carIds`, torque de 0 a 100, massa e velocidade positivas. O `parse` roda na carga do módulo.
- [ ] Teste em `cars.test.ts`: os ids do catálogo e `carIds` são o mesmo conjunto.

### Task 4.6: Radar desfocado e pegadas distorcidas

**Files:** Modify `src/ui/radar-map.ts`, `src/ui/hud.css`, `src/ui/mount-hud.ts`

- [ ] Tamanho do canvas = tamanho do conteúdo × DPR: ler `clientWidth` depois da borda, ou tirar `box-sizing: border-box`. Refazer quando o DPR muda (mesmo mecanismo da Task 1.9).
- [ ] `stamp`: aplicar a escala por eixo antes da rotação (escala do atlas → translação → rotação, na ordem certa do `ctx`). Uma alternativa é desenhar o polígono já transformado.
- [ ] Verificar à mão: prédios inclinados no radar mantêm a forma, e o N fica centrado.

### Task 4.7: Scripts

**Files:** Modify `scripts/validate-vehicle.ts`, `scripts/play.mjs`

- [ ] `validate-vehicle`: contar triângulos de primitivas sem índice (`count / 3`) e calcular os limites com a matriz de mundo de cada nó.
- [ ] `play.mjs`: antes do `taskkill`, conferir pelo nome da imagem do PID (`tasklist /FI "PID eq …"`) que o processo é `node.exe`. Chamar `stop()` também quando o filho sai por sinal.

---

## Fase 5 — Servidor (`fix/server-limits`)

Constantes novas em `src/content/sim.ts` (ou num `net/limits.ts`), para os testes lerem os mesmos números.

### Task 5.1: Transporte

**Files:** Modify `server/index.ts` · Test `src/tests/multiplayer.test.ts`

- [ ] `new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024, verifyClient })`.
- [ ] `verifyClient` aceita só o Origin da lista (`http://localhost:6969`, `http://127.0.0.1:6969`, a porta do Vite, mais `BAIRRO_ORIGINS` do ambiente, separado por vírgula). O proxy do Vite repassa o Origin do browser. Conferir com `pnpm play`.
- [ ] Balde de fichas por socket: 60 mensagens/s com rajada de 120. Acima disso, descartar. Fechar com 1008 depois de 5 s seguidos acima do limite.
- [ ] Tirar o balde e o Origin para funções puras e testar.

### Task 5.2: Posição informada pelo cliente

**Files:** Modify `src/net/room.ts` (`pushPose`, `steerCar`)

- [ ] Guardar `lastPoseAt` por jogador. Rejeitar (e não aplicar) um deslocamento maior que `maxSpeed × dt + folga`. Usar `maxSpeed` a pé = velocidade de corrida × 1,5. No carro = `maxSpeedKmh / 3,6` do carro × 1,2. Ao rejeitar, mandar a posição do servidor de volta no próximo snapshot `self` para o cliente corrigir.
- [ ] A mesma regra vale para `steerCar`.
- [ ] Testes: pose a 500 m de distância em 50 ms é ignorada, e um `pickup` logo depois, longe do drop, não recolhe nada. Uma caminhada normal passa.

### Task 5.3: Soco sem recarga

**Files:** Modify `src/net/room.ts` (`pushPunch`)

- [ ] Guardar `lastPunchAt` por jogador. Exigir 0,42 s entre socos leves e 0,92 s para um pesado, os mesmos números de `ped-ai`. Mover essas constantes para um lugar comum.
- [ ] Soco pesado só é aceito se o anterior foi há pelo menos 0,92 s. O dano continua vindo da regra do servidor.
- [ ] O alcance do soco usa a posição do servidor, não o `x/z` da mensagem.
- [ ] Teste: 40 socos pesados numa rajada dão no máximo um golpe.

### Task 5.4: NPCs não renascem

**Files:** Modify `src/net/room.ts` (`killNpc`, `tick`)

- [ ] Ao morrer, o NPC agenda o renascimento (por exemplo 30 s) num ponto de spawn longe de todos os jogadores, reaproveitando o mesmo id ou um id novo (conferir o que o cliente espera em `remotes.ts`).
- [ ] Teste: matar todos os NPCs e avançar 31 s. Expected: a contagem volta.

### Task 5.5: Drops eternos e `hitAt` crescendo

**Files:** Modify `src/net/room.ts`

- [ ] Drops com `expiresAt` (60 s) e limite de 64 por sala, removendo o mais antigo.
- [ ] `hitAt`: no `leave`, apagar a chave do jogador em todos os carros. Ou trocar o Map por `{ id, at }` com no máximo 8 entradas.
- [ ] `carPathBlocked`: a checagem antecipada só detecta. Derrubar (`npc.down`) fica no contato real.
- [ ] Testes: o drop some depois de 60 s, e a sala nunca passa de 64 drops.

### Task 5.6: Nomes

**Files:** Modify `src/net/room.ts` (`chooseName`)

- [ ] Cortar por ponto de código (`Array.from(name).slice(0, 16).join('')`) e remover `‪-‮`, `⁦-⁩`, `​-‏`.
- [ ] Teste com um emoji na posição 16 e com `‮`.

### Task 5.7: Cliente — fantasmas que nunca saem e desconexão muda

**Files:** Modify `src/game/features/net/remotes.ts`, `src/net/session.ts`, `src/game/systems/net.ts`, `src/game/systems/net-ride.ts`, `src/ui/mount-hud.ts`

- [ ] `remotes.ts`: um fantasma que sai do snapshot (corpo, drop) é removido da cena e tem a malha liberada pelo renderer. Uma alternativa é um pool fixo de malhas para corpos e drops. `resetRemotes` libera todos.
- [ ] Corpos usam `body.kind`: jogador → modelo do jogador, NPC → `citizens[variant]`.
- [ ] `session.ts`: estado `connected | lost`. No `close` ou `error` depois do `welcome`, passar a `lost`, emitir `net:lost` no `EventBus`, e o HUD mostra "Conexão perdida" com botão para o menu.
- [ ] `resetNet` zera `poseWait`. `resetNetRide` libera a entidade de `rideEid` antes de zerar.

### Task 5.8: Custo por tick

**Files:** Modify `server/index.ts`, `src/net/room.ts`

- [ ] Montar e serializar a parte comum do snapshot (NPCs, carros, drops, corpos, lista de jogadores) uma vez por tick. Cada membro recebe essa string mais o `self` (dois campos, ou uma concatenação de JSON montada à mão).
- [ ] Sala sem membros não simula NPCs nem tráfego.
- [ ] Verificar: um teste com 16 membros chama `JSON.stringify` da parte comum uma vez por tick (espiar com `vi.spyOn`).

---

## Fase 6 — Desempenho no caminho quente (`perf/hot-paths`, depois da Fase 3)

Medir antes e depois: um contador de quadros em `?debug` com o tempo médio de `fixedStep` em 120 pedestres e 40 carros. Anotar os números no PR.

### Task 6.1: `solidAt` é O(n²) e aloca

**Files:** Modify `src/game/systems/pedestrians.ts`, novo `src/game/play/spatial-grid.ts` · Test novo `spatial-grid.test.ts`

- [ ] Grade espacial uniforme (células de 4 m) reconstruída uma vez por tick com pedestres e carros. `solidAt` consulta só as 9 células vizinhas.
- [ ] Trocar `yawFromQuat({...})` por um quaternion de rascunho do módulo.
- [ ] Colliders da cidade: indexar por chunk ativo (o stream já sabe quais estão ativos) e não varrer a lista toda.

### Task 6.2: `boxExit` e companhia alocam

**Files:** Modify `src/game/systems/traffic-ai.ts`, `traffic.ts`, `interaction.ts`

- [ ] `boxExit`: eixos, cantos e resultado em arrays de rascunho do módulo. O resultado volta num objeto reaproveitado. Documentar que ele vale até a próxima chamada.
- [ ] `pickNext`: devolver por um objeto de rascunho.
- [ ] `interaction.ts`: içar as closures para o módulo.
- [ ] `hitsTraffic`, `avenueClose` e `drive`: usar a grade da Task 6.1.

### Task 6.3: HUD por quadro

**Files:** Modify `src/ui/mount-hud.ts`, `src/ui/street-route.ts`

- [ ] Rota do waypoint: guardar o resultado em cache e recalcular só quando muda o waypoint ou o nó de rua mais próximo do jogador. `routeOnStreets` deixa de copiar `adj` e `weight` (Dijkstra sobre o grafo original com arrays de distância reaproveitados).
- [ ] Os textos do HUD só são escritos quando o valor muda (comparar com o último valor escrito).
- [ ] `fillRoster`: ler `clientWidth` e `clientHeight` antes das escritas, ou guardar o tamanho em cache e atualizar num `ResizeObserver`.

### Task 6.4: Alocações menores

**Files:** Modify `src/engine/render/three-renderer.ts`, `src/engine/input/aim-cursor.ts` / `src/game/play/aim-cursor.ts`, `src/app/bootstrap.ts`, `src/engine/render/materials/material-library.ts`

- [ ] `renderer.project(x, y, z, out)` com um parâmetro de saída.
- [ ] `stepAimCursor` escreve num objeto passado.
- [ ] Presença em `bootstrap.ts`: um array reaproveitado em vez de `flatMap` com spread.
- [ ] `renderer.tick` pula os mixers de malhas invisíveis.
- [ ] Apagar a escrita de `uv2` (three 0.186 lê AO de `uv1`). Conferir se algum material depende dela.

---

## Fase 7 — Arquitetura e testes (`chore/architecture-tests`)

### Task 7.1: Tipos de jogo em `engine/core`

**Files:** Modify `src/engine/core/context.ts`, novos `src/game/events.ts` e `src/net/snapshot.ts`

- [ ] Mover `GameEvents`, `NetSnapshot` e `DebugState` para fora de `engine/core`. `GameContext` fica genérico no tipo dos eventos, ou importa por `import type` de `game`. Escolher o que der menos ciclo e registrar num ADR em `DECISIONS.md`.

### Task 7.2: Sistemas que se chamam

**Files:** Modify `src/game/systems/traffic.ts`, `interaction.ts`, `pedestrians.ts`, `cash.ts`

- [ ] `attachDriver` e `ejectDriver` saem de `systems/pedestrians.ts` e vão para `src/game/play/drivers.ts`, que só mexe em componentes. Os três sistemas importam de `play`.
- [ ] `cash.ts`: `hideBody`, `showBody` e `layLocalCorpse` entram por evento (`player:died`, `player:respawned`) ou também vão para `play`. Seguir a regra do ARCHITECTURE.md e registrar a escolha.
- [ ] `Mode` sai de `systems/player-movement.ts` e vai para `ecs/components.ts`.

### Task 7.3: Regras do ESLint cobrindo o documento

**Files:** Modify `eslint.config.js`

- [ ] Banir Three e Rapier também em `src/ui/**`, `src/net/**` e `server/**/*.ts`.
- [ ] O bloco de `src/content/**` vem da Task 4.4.

### Task 7.4: Testes dos sistemas sem cobertura

**Files:** novos em `src/tests/`

- [ ] `traffic.test.ts`: o carro segue a faixa, estaciona num beco de mão única sem motorista (Task 3.2), e vira destroço ao ser atingido.
- [ ] `pedestrians.test.ts`: transições idle → walk → wait → cross, fuga de um carro, e morte → drop → reciclagem.
- [ ] `stream-city.test.ts`: ao dirigir para longe do corpo, carrega os chunks em volta do carro e esconde os de trás.
- [ ] `mission.test.ts` e `vehicle-drive.test.ts` cobrindo o caminho principal.
- [ ] Reforçar os testes fracos:
  - `player-query.test.ts:28`: afirmar algo que a query computa, não o valor recém-escrito.
  - `boot-island.test.ts`: um raycast no heightfield bate na altura certa, e o navmesh acha caminho entre dois pontos de calçada.
  - `sky.test.ts`: remover ou trocar por um teste com comportamento.

---

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
