# Modo admin e escolha de spawn — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Com o modo admin ligado (o padrão), o jogador escolhe o bairro onde nasce, e cada morte volta a esse ponto, no solo e na sala.

**Architecture:** `GameSettings` guarda `admin` e `spawn`. O menu mostra o interruptor e a lista. O solo resolve o nome com `findSpawn` e grava o ponto em `Player`. A sala recebe `spawn` na query, grava `home` no jogador quando o nome existe, e o respawn usa `home` ou sorteia de novo.

**Tech Stack:** TypeScript, Vitest, Zod 4, DOM do menu, WebSocket já existente.

## Global Constraints

- Interruptor **Modo admin** no painel principal, ligado por padrão. Lista: Centro, Jurerê, Norte, Leste, Sul, com valores `centro`, `jurere`, `norte`, `leste`, `sul`. Centro já selecionado.
- Os dois campos gravam-se com as outras preferências no momento em que mudam. Gravação antiga sem eles continua válida e completa `admin: true` e `spawn: 'centro'`. JSON partido, ou bairro fora da lista, cai nos padrões inteiros.
- Desligado, a lista some e a partida não leva nome de bairro.
- No menu de pausa, mudar o interruptor ou o bairro não move o jogador. Continuar também não. A próxima Com missão, Sem missão ou sala é que usa os valores novos.
- O cliente envia só o nome, no parâmetro `spawn` da query, junto de `room` e `name`. Não envia coordenadas.
- No solo, `spawnPlayer` grava `x`, `y` e `z` no componente `Player`. A morte lê esses valores. Nome desconhecido ou modo desligado usa `soloSpawn()`.
- Na sala, nome válido grava `home` e a morte volta a esse ponto. Sem nome, string vazia ou nome desconhecido: `home` fica vazio, a entrada sorteia, e cada morte sorteia de novo.
- A caixa e o ponto de entrega da missão não mudam.
- Testes em `src/tests`, ambiente `node`, sem DOM para o markup do menu.
- Não fazer commit nesta sessão. O pedido foi implementar.

---

### Task 1: Achar um spawn pelo nome

**Files:**

- Modify: `src/content/spawns.ts`
- Test: `src/tests/multiplayer.test.ts`

**Interfaces:**

- Consumes: `BairroSpawn`
- Produces: `findSpawn(spawns: readonly BairroSpawn[], name: string): BairroSpawn | null`

- [ ] **Step 1: Write the failing test**

No `describe('bairro spawns')`:

```ts
it('finds a neighborhood by its exact name', () => {
  const points = bairroSpawns(buildRoadGraph());
  expect(findSpawn(points, 'norte')).toEqual(points.find((point) => point.name === 'norte'));
  expect(findSpawn(points, '')).toBeNull();
  expect(findSpawn(points, 'mar')).toBeNull();
});
```

Importar `findSpawn` de `../content/spawns`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/tests/multiplayer.test.ts -t "finds a neighborhood"`
Expected: FAIL, `findSpawn` não exportado.

- [ ] **Step 3: Write minimal implementation**

Em `src/content/spawns.ts`, depois de `pickSpawn`:

```ts
export function findSpawn(spawns: readonly BairroSpawn[], name: string): BairroSpawn | null {
  if (name.length === 0) return null;
  return spawns.find((spawn) => spawn.name === name) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/tests/multiplayer.test.ts -t "finds a neighborhood"`
Expected: PASS

### Task 2: Preferências

**Files:**

- Modify: `src/ui/settings.ts`
- Test: `src/tests/settings.test.ts`

**Interfaces:**

- Consumes: nada da Task 1
- Produces: `spawnNames`, `SpawnName`, `GameSettings.admin: boolean`, `GameSettings.spawn: SpawnName`, `defaultSettings.admin === true`, `defaultSettings.spawn === 'centro'`

- [ ] **Step 1: Write the failing tests**

```ts
it('fills admin mode when an older save has no spawn fields', () => {
  const store = memoryStore(
    JSON.stringify({ mouseScale: 0.5, volume: 0.2, shadows: 'off', sharpness: 'low' }),
  );
  expect(loadSettings(store)).toEqual({
    mouseScale: 0.5,
    volume: 0.2,
    shadows: 'off',
    sharpness: 'low',
    admin: true,
    spawn: 'centro',
  });
});

it('round-trips admin off at jurere', () => {
  const store = memoryStore();
  saveSettings({ ...defaultSettings, admin: false, spawn: 'jurere' }, store);
  expect(loadSettings(store)).toMatchObject({ admin: false, spawn: 'jurere' });
});

it('drops a save whose bairro is not in the list', () => {
  const store = memoryStore(
    JSON.stringify({ mouseScale: 1, volume: 1, shadows: 'high', sharpness: 'high', spawn: 'mar' }),
  );
  expect(loadSettings(store)).toMatchObject({ admin: true, spawn: 'centro' });
});
```

O teste que já compara `loadSettings(memoryStore())` com `defaultSettings` passa a exigir os campos novos quando `defaultSettings` os tiver.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/tests/settings.test.ts`
Expected: FAIL em `admin` / `spawn`.

- [ ] **Step 3: Write minimal implementation**

```ts
export const spawnNames = ['centro', 'jurere', 'norte', 'leste', 'sul'] as const;
export type SpawnName = (typeof spawnNames)[number];

export interface GameSettings {
  mouseScale: number;
  volume: number;
  shadows: ShadowQuality;
  sharpness: Sharpness;
  admin: boolean;
  spawn: SpawnName;
}

export const defaultSettings: GameSettings = {
  mouseScale: 1,
  volume: 1,
  shadows: 'high',
  sharpness: 'high',
  admin: true,
  spawn: 'centro',
};

const settingsSchema = z.object({
  mouseScale: z.number().min(0.4).max(2.5),
  volume: z.number().min(0).max(1),
  shadows: z.enum(shadowQualities),
  sharpness: z.enum(sharpnessLevels),
  admin: z.boolean().default(true),
  spawn: z.enum(spawnNames).default('centro'),
});
```

`loadSettings` continua a devolver o objeto parseado, ou `{ ...defaultSettings }` se o parse falhar.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/tests/settings.test.ts`
Expected: PASS

### Task 3: Casa do jogador na sala

**Files:**

- Modify: `src/net/room.ts` (`join`, `Guy`, `revive`)
- Test: `src/tests/multiplayer.test.ts`

**Interfaces:**

- Consumes: `findSpawn(spawns, name)`
- Produces: `join(room: Room, requestedName?: string, requestedSpawn?: string): number | null`. `Guy.home` é `{ x: number; y: number; z: number } | null`.

- [ ] **Step 1: Write the failing tests**

```ts
it('respawns a chosen bairro at that same point', () => {
  const live = room();
  const id = join(live, 'Kay', 'sul') ?? 0;
  const other = join(live) ?? 0;
  expect(snapshot(live, id).self.place).toEqual({ x: 10, y: 2, z: 0 });
  down(live, id, other);
  tick(live, RESPAWN_DELAY);
  expect(snapshot(live, id).self.place).toEqual({ x: 10, y: 2, z: 0 });
});

it('rerolls when the player did not choose a bairro', () => {
  let call = 0;
  const live = createRoom({
    id: 'costa-1',
    name: 'Costa 1',
    spawns,
    nodes,
    edges,
    rng: () => (call++ === 0 ? 0 : 0.6),
    npcCount: 0,
    carCount: 0,
    maxPlayers: 2,
  });
  const id = join(live) ?? 0;
  const other = join(live, 'Kay', 'sul') ?? 0;
  expect(snapshot(live, id).self.place).toEqual({ x: 0, y: 2, z: 0 });
  expect(snapshot(live, other).self.place).toEqual({ x: 10, y: 2, z: 0 });
  down(live, id, other);
  tick(live, RESPAWN_DELAY);
  expect(snapshot(live, id).self.place).toEqual({ x: 10, y: 2, z: 0 });
  expect(snapshot(live, other).self.place).toEqual({ x: 10, y: 2, z: 0 });
});

it('rolls when the requested bairro is blank or unknown', () => {
  const blank = room();
  const unknown = room();
  const blankId = join(blank, 'Kay', '') ?? 0;
  const unknownId = join(unknown, 'Kay', 'mar') ?? 0;
  expect(snapshot(blank, blankId).self.place).toEqual({ x: 0, y: 2, z: 0 });
  expect(snapshot(unknown, unknownId).self.place).toEqual({ x: 0, y: 2, z: 0 });
});
```

`down` copia o soco do teste de morte que já existe: o atacante fica em `z - 1.2` com `yaw` `Math.PI` e dá cinco socos leves.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/tests/multiplayer.test.ts -t "chosen bairro|did not choose|blank or unknown"`
Expected: FAIL. `join` com `'sul'` ainda sorteia Centro porque `rng` devolve 0.

- [ ] **Step 3: Write minimal implementation**

`Guy` ganha `home: { x: number; y: number; z: number } | null`.

```ts
export function join(room: Room, requestedName?: string, requestedSpawn?: string): number | null {
  if (room.players.length >= room.maxPlayers) return null;
  const id = room.nextPlayer;
  room.nextPlayer += 1;
  const chosen = findSpawn(room.spawns, requestedSpawn ?? '');
  const spawn = chosen ?? pickSpawn(room.spawns, room.rng);
  room.players.push({
    /* campos atuais */
    home: chosen ? { x: chosen.x, y: chosen.y, z: chosen.z } : null,
  });
  return id;
}

function revive(room: Room, player: Guy): void {
  const spawn = player.home ?? pickSpawn(room.spawns, room.rng);
  /* o resto igual, usando spawn.x/y/z */
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/tests/multiplayer.test.ts`
Expected: PASS, incluindo os testes de `join` que não passam bairro.

### Task 4: Ponto gravado no solo

**Files:**

- Modify: `src/game/ecs/components.ts` (`Player.homeX`, `Player.homeY`, `Player.homeZ`)
- Modify: `src/game/features/player/spawn-player.ts`
- Modify: `src/game/systems/cash.ts`

**Interfaces:**

- Consumes: o ponto `at` que `spawnPlayer` já recebe
- Produces: `Player.homeX/Y/Z[eid]` iguais a `at` depois de `spawnPlayer`. `cashSystem` lê esses valores e não chama `soloSpawn()`.

- [ ] **Step 1: Write the arrays and the two call sites**

```ts
homeX: new Float32Array(CAP),
homeY: new Float32Array(CAP),
homeZ: new Float32Array(CAP),
```

Em `spawnPlayer`, depois de `const y = at.y`:

```ts
Player.homeX[eid] = x;
Player.homeY[eid] = y;
Player.homeZ[eid] = z;
```

Em `cashSystem`, no lugar de `const spawn = soloSpawn()`:

```ts
showBody(ctx, eid, Player.homeX[eid] ?? 0, Player.homeY[eid] ?? 0, Player.homeZ[eid] ?? 0);
```

Remover o import de `soloSpawn` em `cash.ts`. O spec não pede teste de browser nem de sistema de dinheiro. O comportamento da sala cobre a morte com ponto fixo. Este passo não tem teste de DOM.

- [ ] **Step 2: Run the room tests**

Run: `pnpm exec vitest run src/tests/multiplayer.test.ts src/tests/settings.test.ts`
Expected: PASS

### Task 5: Menu, query e entrada

**Files:**

- Modify: `src/net/session.ts`
- Modify: `server/index.ts`
- Modify: `src/ui/start-menu.ts`
- Modify: `src/ui/hud.css`
- Modify: `src/app/bootstrap.ts`
- Test: `src/tests/multiplayer.test.ts` para a query

**Interfaces:**

- Consumes: `SpawnName`, `findSpawn`, `bairroSpawns`, `join(..., spawn)`
- Produces: `roomSocketQuery(roomId: string, playerName = '', spawnName = ''): string`. `LaunchChoice.spawn?: SpawnName`. `connectRoom(roomId, playerName = '', spawnName = '')`.

- [ ] **Step 1: Write the failing query test**

```ts
it('adds spawn to the socket query only when a bairro was chosen', () => {
  expect(roomSocketQuery('costa-1', 'Ana', 'sul')).toBe('room=costa-1&name=Ana&spawn=sul');
  expect(roomSocketQuery('costa-1', 'Ana')).toBe('room=costa-1&name=Ana');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/tests/multiplayer.test.ts -t "socket query"`
Expected: FAIL, `roomSocketQuery` não exportado.

- [ ] **Step 3: Query, server, menu, bootstrap**

`session.ts`:

```ts
export function roomSocketQuery(roomId: string, playerName = '', spawnName = ''): string {
  const query = new URLSearchParams({ room: roomId, name: playerName });
  if (spawnName.length > 0) query.set('spawn', spawnName);
  return query.toString();
}

export function connectRoom(roomId: string, playerName = '', spawnName = ''): Promise<Connected> {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(
    `${protocol}//${location.host}/ws?${roomSocketQuery(roomId, playerName, spawnName)}`,
  );
  /* resto igual */
}
```

`server/index.ts`:

```ts
const id = join(room.sim, url.searchParams.get('name') ?? '', url.searchParams.get('spawn') ?? '');
```

`LaunchChoice` ganha `spawn?: SpawnName`. Em `launch`, se `settings.admin`, `choice.spawn = settings.spawn`.

No painel principal, um checkbox **Modo admin** (`settings.admin`) e um `selectField` **Bairro** com os cinco nomes. `hidden` quando admin está desligado. `change` grava com `saveSettings` e chama `onSettings`. `applySettings` em `bootstrap.ts` não lê `spawn`, por isso a sessão corrente não se move.

`bootstrap.ts`, depois de `buildCostaVerde()`:

```ts
const at = connected
  ? {
      name: 'sala',
      x: connected.welcome.x,
      y: connected.welcome.y,
      z: connected.welcome.z,
    }
  : (findSpawn(bairroSpawns(city.graph), launch.spawn ?? '') ?? soloSpawn());
```

`connectRoom(launch.roomId, launch.playerName, launch.spawn ?? '')`.

CSS: `.menu-check` em linha, com o checkbox à direita e `accent-color: #f2c14e`.

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run src/tests/multiplayer.test.ts src/tests/settings.test.ts`
Expected: PASS
