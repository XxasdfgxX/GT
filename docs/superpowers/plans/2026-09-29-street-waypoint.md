# Waypoint pelas ruas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No menu de pausa, abrir o mapa da ilha, marcar um destino com um clique e desenhar o caminho pelas ruas até lá.

**Architecture:** `street-route.ts` calcula o caminho mais curto em `city.graph`. `waypoint.ts` guarda um único ponto. O `bootstrap` cria os dois uma vez por sessão e passa-os ao menu e ao HUD. O menu desenha o atlas já produzido por `bakeRadarMap`. O radar desenha a mesma linha e um losango, sem puxar os vértices da linha para a borda.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, DOM do menu já existente.

## Global Constraints

- Botão **Mapa** só no menu de pausa. O menu inicial em `src/main.ts` não o mostra.
- Primeiro clique grava o ponto. Segundo clique, em qualquer sítio do mapa, apaga e não grava outro. Terceiro clique marca outro destino.
- Chegar a 12 metros ou menos no plano XZ apaga o waypoint nesse frame, antes do radar desenhar. Vale a pé e de carro, na posição que `readHud` já usa.
- A rota segue `city.graph` nos dois sentidos. Não cria atalhos fora das arestas. Não usa a largura da rua.
- Linha `#7ec8e3`. Cursor losango `#f2c14e`. O marcador da missão continua o círculo `#f2c14e` que já existe.
- Mapa com norte para cima, sem rodar com a câmara e sem o espelho X do radar.
- Continuar e a tecla do menu mantêm o waypoint. Com missão ou Sem missão criam outra sessão e o waypoint some.
- Um destino de cada vez. Sem arrastar. Sem marcador no mundo 3D.
- Testes em `src/tests`, ambiente `node`, sem DOM.
- O `tsc` do repositório já falha em ficheiros fora desta feature (`spawn-map`, física, renderer). Não os corrigir. Verificar com o Vitest indicado em cada tarefa.

---

### Task 1: Pixel do atlas de volta ao mundo

**Files:**

- Modify: `src/ui/radar-map.ts`
- Test: `src/tests/radar.test.ts`

**Interfaces:**

- Consumes: `atlasPixel`, `radarBounds`, `AtlasBounds` em `src/ui/radar-map.ts`
- Produces: `worldFromAtlas(u: number, v: number, bounds: AtlasBounds, size: number): WorldPoint`

- [ ] **Step 1: Write the failing test**

Acrescentar no fim do `describe` em `src/tests/radar.test.ts`:

```ts
it('round-trips a world point through the atlas', () => {
  const bounds = radarBounds();
  const pixel = atlasPixel(120, -40, bounds, 1024);
  const world = worldFromAtlas(pixel.u, pixel.v, bounds, 1024);
  expect(world.x).toBeCloseTo(120, 4);
  expect(world.z).toBeCloseTo(-40, 4);
});
```

Incluir `worldFromAtlas` no import de `../ui/radar-map`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/radar.test.ts`

Expected: FAIL porque `worldFromAtlas` não existe.

- [ ] **Step 3: Write minimal implementation**

Em `src/ui/radar-map.ts`, logo a seguir a `atlasPixel`:

```ts
/** Inverse of atlasPixel. North stays up. */
export function worldFromAtlas(
  u: number,
  v: number,
  bounds: AtlasBounds,
  size: number,
): WorldPoint {
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  return {
    x: bounds.minX + (u / size) * spanX,
    z: bounds.maxZ - (v / size) * spanZ,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/radar.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/radar-map.ts src/tests/radar.test.ts
git commit -m "$(cat <<'EOF'
Converte um pixel do atlas de volta para o mundo.

EOF
)"
```

---

### Task 2: Um waypoint

**Files:**

- Create: `src/ui/waypoint.ts`
- Test: `src/tests/waypoint.test.ts`

**Interfaces:**

- Consumes: nada
- Produces:
  - `interface MapPoint { x: number; z: number }`
  - `interface Waypoint { get(): MapPoint | null; set(point: MapPoint): void; clear(): void; arrived(x: number, z: number): boolean }`
  - `const ARRIVAL_METERS = 12`
  - `createWaypoint(): Waypoint`
  - `nextWaypoint(current: MapPoint | null, click: MapPoint): MapPoint | null`

- [ ] **Step 1: Write the failing test**

Criar `src/tests/waypoint.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createWaypoint, nextWaypoint } from '../ui/waypoint';

describe('waypoint', () => {
  it('clears at 12 meters and keeps the point past that', () => {
    const waypoint = createWaypoint();
    waypoint.set({ x: 0, z: 0 });
    if (waypoint.arrived(0, 12)) waypoint.clear();
    expect(waypoint.get()).toBeNull();

    waypoint.set({ x: 0, z: 0 });
    if (waypoint.arrived(0, 12.01)) waypoint.clear();
    expect(waypoint.get()).toEqual({ x: 0, z: 0 });
  });

  it('stores a click when empty and clears when one is already set', () => {
    expect(nextWaypoint(null, { x: 4, z: 8 })).toEqual({ x: 4, z: 8 });
    expect(nextWaypoint({ x: 4, z: 8 }, { x: 1, z: 2 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/waypoint.test.ts`

Expected: FAIL porque o módulo não existe.

- [ ] **Step 3: Write minimal implementation**

Criar `src/ui/waypoint.ts`:

```ts
/** One map pin for the current session. */

export interface MapPoint {
  x: number;
  z: number;
}

export interface Waypoint {
  get(): MapPoint | null;
  set(point: MapPoint): void;
  clear(): void;
  /** True when a pin is set and the XZ distance is 12 meters or less. */
  arrived(x: number, z: number): boolean;
}

export const ARRIVAL_METERS = 12;

export function createWaypoint(): Waypoint {
  let point: MapPoint | null = null;
  return {
    get: () => point,
    set(next) {
      point = { x: next.x, z: next.z };
    },
    clear() {
      point = null;
    },
    arrived(x, z) {
      if (!point) return false;
      return Math.hypot(x - point.x, z - point.z) <= ARRIVAL_METERS;
    },
  };
}

/** A click stores the point only while no pin is set. Otherwise it clears. */
export function nextWaypoint(current: MapPoint | null, click: MapPoint): MapPoint | null {
  if (current) return null;
  return { x: click.x, z: click.z };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/waypoint.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/waypoint.ts src/tests/waypoint.test.ts
git commit -m "$(cat <<'EOF'
Guarda um waypoint e apaga ao chegar ou num segundo clique.

EOF
)"
```

---

### Task 3: Rota pelas ruas

**Files:**

- Create: `src/ui/street-route.ts`
- Test: `src/tests/street-route.test.ts`

**Interfaces:**

- Consumes: nada de DOM. `createCity().graph` encaixa em `StreetMap` porque os nós têm `x`/`z` e as arestas têm `a`/`b`/`length`. `a` e `b` são índices de `nodes`.
- Produces:
  - `interface RoutePoint { x: number; z: number }`
  - `interface StreetMap { nodes: readonly { x: number; z: number }[]; edges: readonly { a: number; b: number; length: number }[] }`
  - `interface StreetIndex { map: StreetMap; adj: number[][]; weight: number[][] }`
  - `indexStreets(map: StreetMap): StreetIndex`
  - `routeOnStreets(index: StreetIndex, playerX: number, playerZ: number, targetX: number, targetZ: number): RoutePoint[]`

- [ ] **Step 1: Write the failing test**

Criar `src/tests/street-route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCity } from '../content/city';
import { indexStreets, routeOnStreets, type StreetMap } from '../ui/street-route';

const corner: StreetMap = {
  nodes: [
    { x: 0, z: 10 },
    { x: 0, z: 0 },
    { x: 40, z: 0 },
  ],
  edges: [
    { a: 0, b: 1, length: 10 },
    { a: 1, b: 2, length: 40 },
  ],
};

const split: StreetMap = {
  nodes: [
    { x: 0, z: 0 },
    { x: 0, z: 10 },
    { x: 200, z: 0 },
    { x: 200, z: 10 },
  ],
  edges: [
    { a: 0, b: 1, length: 10 },
    { a: 2, b: 3, length: 10 },
  ],
};

describe('street route', () => {
  it('turns the corner instead of cutting across the block', () => {
    const route = routeOnStreets(indexStreets(corner), 0, 10, 40, 0);
    expect(route.some((point) => Math.hypot(point.x, point.z) <= 0.01)).toBe(true);
  });

  it('stays on a vertical edge', () => {
    const road: StreetMap = {
      nodes: [
        { x: 0, z: 0 },
        { x: 0, z: 100 },
      ],
      edges: [{ a: 0, b: 1, length: 100 }],
    };
    const route = routeOnStreets(indexStreets(road), 0, 20, 0, 70);
    for (const point of route) expect(Math.abs(point.x)).toBeLessThanOrEqual(1);
  });

  it('falls back to a straight line when the streets do not connect', () => {
    const route = routeOnStreets(indexStreets(split), 5, 5, 205, 5);
    expect(route).toEqual([
      { x: 5, z: 5 },
      { x: 0, z: 5 },
      { x: 200, z: 5 },
      { x: 205, z: 5 },
    ]);
  });

  it('follows Costa Verde edges between nodes that do not share a street', () => {
    const graph = createCity().graph;
    const neighbors = new Set<number>();
    for (const edge of graph.edges) {
      if (edge.a === 0) neighbors.add(edge.b);
      if (edge.b === 0) neighbors.add(edge.a);
    }
    const far = graph.nodes.find((node) => node.id !== 0 && !neighbors.has(node.id));
    expect(far).toBeDefined();
    if (!far) return;
    const start = graph.nodes[0];
    expect(start).toBeDefined();
    if (!start) return;
    const route = routeOnStreets(indexStreets(graph), start.x, start.z, far.x, far.z);
    expect(route.length).toBeGreaterThan(2);
    for (let i = 1; i < route.length; i += 1) {
      const prev = route[i - 1];
      const next = route[i];
      expect(prev && next && sharesEdge(graph, prev, next)).toBe(true);
    }
  });
});

function sharesEdge(
  graph: StreetMap,
  from: { x: number; z: number },
  to: { x: number; z: number },
): boolean {
  return graph.edges.some((edge) => {
    const a = graph.nodes[edge.a];
    const b = graph.nodes[edge.b];
    if (!a || !b) return false;
    return onSegment(from, a, b) && onSegment(to, a, b);
  });
}

function onSegment(
  point: { x: number; z: number },
  a: { x: number; z: number },
  b: { x: number; z: number },
): boolean {
  const span = Math.hypot(b.x - a.x, b.z - a.z);
  const left = Math.hypot(point.x - a.x, point.z - a.z);
  const right = Math.hypot(b.x - point.x, b.z - point.z);
  return Math.abs(left + right - span) < 0.05;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/street-route.test.ts`

Expected: FAIL porque o módulo não existe.

- [ ] **Step 3: Write minimal implementation**

Criar `src/ui/street-route.ts`:

```ts
/** Shortest street path. Pure: no DOM, ECS, or Three.js. */

export interface RoutePoint {
  x: number;
  z: number;
}

export interface StreetMap {
  nodes: readonly RoutePoint[];
  edges: readonly { a: number; b: number; length: number }[];
}

export interface StreetIndex {
  map: StreetMap;
  adj: number[][];
  weight: number[][];
}

export function indexStreets(map: StreetMap): StreetIndex {
  const adj = map.nodes.map(() => [] as number[]);
  const weight = map.nodes.map(() => [] as number[]);
  for (const edge of map.edges) {
    const left = adj[edge.a];
    const right = adj[edge.b];
    const leftW = weight[edge.a];
    const rightW = weight[edge.b];
    if (!left || !right || !leftW || !rightW) continue;
    left.push(edge.b);
    leftW.push(edge.length);
    right.push(edge.a);
    rightW.push(edge.length);
  }
  return { map, adj, weight };
}

export function routeOnStreets(
  index: StreetIndex,
  playerX: number,
  playerZ: number,
  targetX: number,
  targetZ: number,
): RoutePoint[] {
  const player = { x: playerX, z: playerZ };
  const target = { x: targetX, z: targetZ };
  const from = nearest(index.map, playerX, playerZ);
  const to = nearest(index.map, targetX, targetZ);
  if (!from || !to) return dedupe([player, target]);

  const points = index.map.nodes.map((node) => ({ x: node.x, z: node.z }));
  const adj = index.adj.map((row) => row.slice());
  const weight = index.weight.map((row) => row.slice());
  const start = points.length;
  points.push(from.point);
  adj.push([]);
  weight.push([]);
  const goal = points.length;
  points.push(to.point);
  adj.push([]);
  weight.push([]);
  join(index.map, adj, weight, points, start, from.edge);
  join(index.map, adj, weight, points, goal, to.edge);
  if (from.edge === to.edge) link(adj, weight, start, goal, hypot(from.point, to.point));

  const path = dijkstra(adj, weight, start, goal);
  if (!path) return dedupe([player, from.point, to.point, target]);
  const middle: RoutePoint[] = [];
  for (const id of path) {
    const point = points[id];
    if (point) middle.push(point);
  }
  return dedupe([player, ...middle, target]);
}

function nearest(map: StreetMap, x: number, z: number): { edge: number; point: RoutePoint } | null {
  let bestEdge = -1;
  let best = Infinity;
  let point = { x, z };
  for (let i = 0; i < map.edges.length; i += 1) {
    const edge = map.edges[i];
    if (!edge) continue;
    const a = map.nodes[edge.a];
    const b = map.nodes[edge.b];
    if (!a || !b) continue;
    const snap = project(a, b, x, z);
    const distance = Math.hypot(snap.x - x, snap.z - z);
    if (distance < best) {
      best = distance;
      bestEdge = i;
      point = snap;
    }
  }
  if (bestEdge < 0) return null;
  return { edge: bestEdge, point };
}

function project(a: RoutePoint, b: RoutePoint, x: number, z: number): RoutePoint {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  if (len2 === 0) return { x: a.x, z: a.z };
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / len2));
  return { x: a.x + abx * t, z: a.z + abz * t };
}

function join(
  map: StreetMap,
  adj: number[][],
  weight: number[][],
  points: RoutePoint[],
  snap: number,
  edgeIndex: number,
): void {
  const edge = map.edges[edgeIndex];
  const here = points[snap];
  if (!edge || !here) return;
  link(adj, weight, snap, edge.a, hypot(here, points[edge.a]));
  link(adj, weight, snap, edge.b, hypot(here, points[edge.b]));
}

function link(adj: number[][], weight: number[][], a: number, b: number, cost: number): void {
  const left = adj[a];
  const right = adj[b];
  const leftW = weight[a];
  const rightW = weight[b];
  const safe = Number.isFinite(cost) ? cost : 0;
  if (!left || !right || !leftW || !rightW) return;
  left.push(b);
  leftW.push(safe);
  right.push(a);
  rightW.push(safe);
}

function hypot(a: RoutePoint | undefined, b: RoutePoint | undefined): number {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function dijkstra(
  adj: number[][],
  weight: number[][],
  start: number,
  goal: number,
): number[] | null {
  const count = adj.length;
  const dist = new Array<number>(count).fill(Infinity);
  const prev = new Array<number>(count).fill(-1);
  const used = new Array<boolean>(count).fill(false);
  const startDist = dist[start];
  if (startDist === undefined) return null;
  dist[start] = 0;
  for (let step = 0; step < count; step += 1) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < count; i += 1) {
      const next = dist[i] ?? Infinity;
      if (!used[i] && next < best) {
        best = next;
        u = i;
      }
    }
    if (u < 0 || u === goal) break;
    used[u] = true;
    const neighbors = adj[u] ?? [];
    const costs = weight[u] ?? [];
    for (let k = 0; k < neighbors.length; k += 1) {
      const v = neighbors[k];
      if (v === undefined || used[v]) continue;
      const stepCost = costs[k] ?? Infinity;
      const base = dist[u] ?? Infinity;
      const next = base + stepCost;
      if (next < (dist[v] ?? Infinity)) {
        dist[v] = next;
        prev[v] = u;
      }
    }
  }
  if ((dist[goal] ?? Infinity) === Infinity) return null;
  const path: number[] = [];
  let cursor = goal;
  while (cursor >= 0) {
    path.push(cursor);
    if (cursor === start) break;
    cursor = prev[cursor] ?? -1;
  }
  path.reverse();
  if (path[0] !== start) return null;
  return path;
}

function dedupe(points: RoutePoint[]): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - point.x, last.z - point.z) < 0.05) continue;
    out.push(point);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/street-route.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/street-route.ts src/tests/street-route.test.ts
git commit -m "$(cat <<'EOF'
Calcula a rota do waypoint pelas ruas.

EOF
)"
```

---

### Task 4: Linha e losango no radar

**Files:**

- Modify: `src/ui/radar-map.ts`
- Test: `src/tests/radar.test.ts`

**Interfaces:**

- Consumes: `radarBlip`, `drawRadar`, `WorldPoint`
- Produces:
  - `radarOffset(playerX: number, playerZ: number, x: number, z: number, radiusPx: number, viewRadius: number): RadarPoint` — o mesmo espaço de `radarBlip`, sem clamp
  - `drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void`
  - `drawRadar` ganha dois argumentos no fim, com default `null`: `route: WorldPoint[] | null`, `waypoint: WorldPoint | null`

- [ ] **Step 1: Write the failing test**

Acrescentar no `describe` de `src/tests/radar.test.ts`:

```ts
it('keeps a far route vertex outside the radar rim', () => {
  const far = radarOffset(0, 0, 400, 0, 90, 64);
  expect(Math.hypot(far.x, far.y)).toBeGreaterThan(76);
});
```

Incluir `radarOffset` no import.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/radar.test.ts`

Expected: FAIL porque `radarOffset` não existe.

- [ ] **Step 3: Write minimal implementation**

Em `src/ui/radar-map.ts`, imediatamente antes de `radarBlip`:

```ts
/** Radar offset before the heading rotation. Not clamped to the rim. */
export function radarOffset(
  playerX: number,
  playerZ: number,
  x: number,
  z: number,
  radiusPx: number,
  viewRadius: number,
): RadarPoint {
  const scale = radiusPx / viewRadius;
  return {
    x: (x - playerX) * scale,
    y: -(z - playerZ) * scale,
  };
}

export const ROUTE_COLOR = '#7ec8e3';

export function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius, y);
  ctx.closePath();
  ctx.fillStyle = '#f2c14e';
  ctx.strokeStyle = '#1a1408';
  ctx.lineWidth = Math.max(1.5, radius * 0.2);
  ctx.fill();
  ctx.stroke();
}
```

Mudar a assinatura de `drawRadar` para:

```ts
export function drawRadar(
  ctx: CanvasRenderingContext2D,
  map: RadarMap,
  playerX: number,
  playerZ: number,
  headingDeg: number,
  blip: WorldPoint | null,
  dpr: number,
  route: WorldPoint[] | null = null,
  waypoint: WorldPoint | null = null,
): void {
```

Dentro de `drawRadar`, depois do preenchimento do `shade` e antes de `if (blip)`:

```ts
if (route && route.length > 1) {
  ctx.beginPath();
  for (let i = 0; i < route.length; i += 1) {
    const point = route[i];
    if (!point) continue;
    const spot = radarOffset(playerX, playerZ, point.x, point.z, radius, RADAR_VIEW_RADIUS);
    if (i === 0) ctx.moveTo(spot.x, spot.y);
    else ctx.lineTo(spot.x, spot.y);
  }
  ctx.strokeStyle = ROUTE_COLOR;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}
if (waypoint) {
  const spot = radarBlip(playerX, playerZ, waypoint.x, waypoint.z, radius, RADAR_VIEW_RADIUS);
  drawPin(ctx, spot.x, spot.y, spot.clamped ? 5 : 6);
}
```

O `if (blip)` existente fica como está: círculo `#f2c14e`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/radar.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/radar-map.ts src/tests/radar.test.ts
git commit -m "$(cat <<'EOF'
Desenha a rota e o cursor no radar.

EOF
)"
```

---

### Task 5: Mapa no menu de pausa

**Files:**

- Create: `src/ui/map-panel.ts`
- Modify: `src/ui/start-menu.ts`
- Modify: `src/ui/hud.css`

**Interfaces:**

- Consumes: `bakeRadarMap` não é chamado aqui. Recebe o `RadarMap` já feito. `atlasPixel`, `drawPin`, `ROUTE_COLOR`, `worldFromAtlas` de `src/ui/radar-map.ts`. `routeOnStreets`, `StreetIndex` de `src/ui/street-route.ts`. `nextWaypoint`, `Waypoint` de `src/ui/waypoint.ts`.
- Produces:
  - `interface PauseMap { image: RadarMap; streets: StreetIndex; playerX: number; playerZ: number; waypoint: Waypoint }`
  - `mountMapPanel(view: PauseMap): HTMLDivElement` — painel escondido, com título, canvas e sem o botão Voltar

- [ ] **Step 1: Write the panel**

Os testes do clique e das coordenadas já estão nas tarefas 1 e 2. Este passo não acrescenta teste de DOM.

Criar `src/ui/map-panel.ts`:

```ts
/** Full-island map inside the pause menu. */

import { atlasPixel, drawPin, ROUTE_COLOR, worldFromAtlas, type RadarMap } from './radar-map';
import { routeOnStreets, type StreetIndex } from './street-route';
import { nextWaypoint, type Waypoint } from './waypoint';

export interface PauseMap {
  image: RadarMap;
  streets: StreetIndex;
  playerX: number;
  playerZ: number;
  waypoint: Waypoint;
}

export function mountMapPanel(view: PauseMap): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'menu-panel';
  panel.hidden = true;

  const title = document.createElement('p');
  title.className = 'menu-section';
  title.textContent = 'Mapa';

  const canvas = document.createElement('canvas');
  canvas.className = 'menu-map';
  canvas.width = view.image.image.width;
  canvas.height = view.image.image.height;
  const ctx = canvas.getContext('2d');

  const paint = () => {
    if (!ctx) return;
    const size = canvas.width;
    const bounds = view.image.bounds;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, canvas.height);
    ctx.drawImage(view.image.image, 0, 0);
    const pin = view.waypoint.get();
    if (pin) {
      const route = routeOnStreets(view.streets, view.playerX, view.playerZ, pin.x, pin.z);
      ctx.beginPath();
      for (let i = 0; i < route.length; i += 1) {
        const point = route[i];
        if (!point) continue;
        const pixel = atlasPixel(point.x, point.z, bounds, size);
        if (i === 0) ctx.moveTo(pixel.u, pixel.v);
        else ctx.lineTo(pixel.u, pixel.v);
      }
      ctx.strokeStyle = ROUTE_COLOR;
      ctx.lineWidth = 8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      const at = atlasPixel(pin.x, pin.z, bounds, size);
      drawPin(ctx, at.u, at.v, 14);
    }
    const player = atlasPixel(view.playerX, view.playerZ, bounds, size);
    ctx.beginPath();
    ctx.arc(player.u, player.v, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();
  };

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const u = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const v = ((event.clientY - rect.top) / rect.height) * canvas.height;
    if (u < 0 || v < 0 || u > canvas.width || v > canvas.height) return;
    const world = worldFromAtlas(u, v, view.image.bounds, canvas.width);
    const next = nextWaypoint(view.waypoint.get(), world);
    if (next) view.waypoint.set(next);
    else view.waypoint.clear();
    paint();
  });

  panel.append(title, canvas);
  paint();
  return panel;
}
```

- [ ] **Step 2: Add the pause-menu button**

Em `src/ui/start-menu.ts`:

Importar `mountMapPanel` e o tipo `PauseMap` com `import type { PauseMap } from './map-panel'` e `import { mountMapPanel } from './map-panel'`. Com `verbatimModuleSyntax`, o tipo vai no import de tipo.

Acrescentar a `MenuOptions`:

```ts
  map?: PauseMap;
```

Depois de criar `soon`:

```ts
const mapView = options?.map;
const openMap = document.createElement('button');
openMap.type = 'button';
openMap.className = 'menu-play menu-secondary';
openMap.textContent = 'Mapa';
openMap.hidden = mapView === undefined;
```

No início de `launch`, junto de `openSettings.disabled = true`:

```ts
openMap.disabled = true;
```

No `catch` de `launch`, junto de `openSettings.disabled = false`:

```ts
openMap.disabled = false;
```

Sem `map`, o botão fica no DOM com `hidden` e o CSS `.menu-card [hidden]` não o mostra. O `main.ts` não passa `map`.

Em `home.append`, a ordem fica `resume, mission, free, openMap, soon, status`.

Criar o painel só quando `mapView` existe:

```ts
const mapPanel = mapView ? mountMapPanel(mapView) : null;
const mapBack = document.createElement('button');
mapBack.type = 'button';
mapBack.className = 'menu-play menu-secondary';
mapBack.textContent = 'Voltar';
mapBack.addEventListener('click', () => {
  if (!mapPanel) return;
  mapPanel.hidden = true;
  home.hidden = false;
  openSettings.hidden = false;
  if (inGame) resume.focus();
  else mission.focus();
});
if (mapPanel) mapPanel.append(mapBack);
```

`Voltar` não chama `waypoint.clear()`.

O clique de `openMap`:

```ts
openMap.addEventListener('click', () => {
  if (!mapPanel) return;
  home.hidden = true;
  settingsPanel.hidden = true;
  mapPanel.hidden = false;
  openSettings.hidden = true;
  mapBack.focus();
});
```

No `click` de `openSettings`, também `if (mapPanel) mapPanel.hidden = true`.

No `card.append`, incluir `mapPanel` quando não for `null`, antes de `openSettings`.

- [ ] **Step 3: Style the canvas**

Em `src/ui/hud.css`, depois de `.menu-section`:

```css
.menu-map {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1;
  border-radius: 11px;
  cursor: crosshair;
}
```

- [ ] **Step 4: Run the pure tests**

Run: `npx vitest run src/tests/radar.test.ts src/tests/waypoint.test.ts src/tests/street-route.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/map-panel.ts src/ui/start-menu.ts src/ui/hud.css
git commit -m "$(cat <<'EOF'
Abre o mapa completo no menu de pausa.

EOF
)"
```

---

### Task 6: Ligar a sessão

**Files:**

- Modify: `src/app/bootstrap.ts`
- Modify: `src/ui/mount-hud.ts`

**Interfaces:**

- Consumes: `createWaypoint` de `src/ui/waypoint.ts`. `indexStreets`, `routeOnStreets` de `src/ui/street-route.ts`. `bakeRadarMap` de `src/ui/radar-map.ts`. `PauseMap` em `MenuOptions.map`. `drawRadar(..., route, waypoint)`.
- Produces: uma sessão com um `Waypoint`, um `StreetIndex` e um `RadarMap` partilhados pelo menu e pelo HUD.

- [ ] **Step 1: Pass the pin into the HUD**

Mudar `mountHud` para:

```ts
export function mountHud(
  root: HTMLElement,
  map: RadarMap,
  streets: StreetIndex,
  waypoint: Waypoint,
  onMenu: () => void,
): Hud {
```

Remover `bakeRadarMap(city)` de dentro de `mountHud`. O parâmetro `city` sai. Trocar os imports do topo para:

```ts
import type { RadarMap } from './radar-map';
import { drawRadar, missionBlip, northMarker, RADAR_SIZE } from './radar-map';
import { routeOnStreets, type StreetIndex } from './street-route';
import type { Waypoint } from './waypoint';
```

O import de `CostaVerde` sai. O resto dos imports de `mount-hud.ts` (`HudModel`, `MissionPhase`, `PromptCode`) mantém-se.

No início de `setPlay`, antes de `drawRadar`:

```ts
if (waypoint.arrived(model.x, model.z)) waypoint.clear();
const pin = waypoint.get();
const route = pin ? routeOnStreets(streets, model.x, model.z, pin.x, pin.z) : null;
```

A chamada de `drawRadar` usa `map` no lugar de `radarMap` e acrescenta `route` e `pin`:

```ts
drawRadar(
  radarCtx,
  map,
  model.x,
  model.z,
  model.heading,
  model.hasMission ? missionBlip(model.missionPhase) : null,
  radarScale,
  route,
  pin,
);
```

- [ ] **Step 2: Create them once per session**

Em `src/app/bootstrap.ts`, depois de `const world = createGameWorld()` e dos spawns, e antes de `openMenu`:

```ts
const radarMap = bakeRadarMap(city);
const streets = indexStreets(city.graph);
const waypoint = createWaypoint();
```

Imports: `bakeRadarMap` de `../ui/radar-map`, `indexStreets` de `../ui/street-route`, `createWaypoint` de `../ui/waypoint`.

`openMenu` passa o mapa com a posição congelada:

```ts
const place = readHud(world);
overlay = mountStartMenu(root, (choice) => start(root, choice), {
  resume: unpause,
  onSettings: applySettings,
  map: {
    image: radarMap,
    streets,
    playerX: place.x,
    playerZ: place.z,
    waypoint,
  },
});
```

A chamada do HUD fica:

```ts
const hud = mountHud(root, radarMap, streets, waypoint, openMenu);
```

`start()` já faz `session?.stop()` no início, e estas três constantes nascem dentro de `start`. Uma sessão nova não herda o waypoint.

- [ ] **Step 3: Run the pure tests**

Run: `npx vitest run src/tests/radar.test.ts src/tests/waypoint.test.ts src/tests/street-route.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/bootstrap.ts src/ui/mount-hud.ts
git commit -m "$(cat <<'EOF'
Liga o waypoint ao menu, ao radar e à chegada.

EOF
)"
```
