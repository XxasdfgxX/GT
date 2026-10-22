/** DOM readout. Gameplay never touches document nodes directly. */

import type { DebugState, NetPlayer, NetRosterEntry } from '../engine/core/context';
import type { Vec3 } from '../engine/core/math';
import { PLAYER_TAG_LIFT } from '../game/features/health-bar';
import type { HudModel } from '../game/play/read-hud';
import { formatCash } from '../game/play/wallet';
import { MissionPhase } from '../game/play/mission';
import { PromptCode } from '../game/play/prompt';
import type { RadarMap, WorldPoint } from './radar-map';
import { drawRadar, missionBlip, northMarker, RADAR_SIZE } from './radar-map';

/** Matches the canvas border in hud.css. */
const RADAR_BORDER = 4;
import { createRouteCache, type StreetIndex } from './street-route';
import { npcScoreLine, playerScoreLine } from './score-line';
import type { Waypoint } from './waypoint';

export interface Presence {
  selfId: number;
  roster: readonly NetRosterEntry[];
  peers: readonly (NetPlayer & { driving: boolean })[];
  project: (point: Vec3) => { x: number; y: number; behind: boolean };
}

export interface Hud {
  toggle(): void;
  toggleScore(): void;
  setStats(draws: number, bodies: number): void;
  setLocked(locked: boolean): void;
  setAim(x: number, y: number, visible: boolean): void;
  setPlay(model: HudModel, peers?: readonly WorldPoint[]): void;
  setCarTitle(name: string, detail: string, x: number, y: number, visible: boolean): void;
  setPresence(presence: Presence | null): void;
  /** Shows that the room dropped. The scene keeps its last state behind the notice. */
  setOffline(offline: boolean): void;
  updateFps(dt: number): void;
  remove(): void;
}

export function mountHud(
  root: HTMLElement,
  map: RadarMap,
  streets: StreetIndex,
  waypoint: Waypoint,
  debug: DebugState,
): Hud {
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent =
    'Clique para o mouse · Setas mover · S segurar correr · S toque ataque forte · A pular · D ataque leve · W carro · Espaço freio · Scroll zoom · botão do meio câmara · crase menu';

  const radar = document.createElement('div');
  radar.className = 'radar';
  // The CSS border eats the edge of the box, so the buffer matches the content area
  // and the 180-unit drawing is scaled down into it instead of blurred.
  const radarPixels = RADAR_SIZE - 2 * RADAR_BORDER;
  const radarScale = (Math.min(window.devicePixelRatio || 1, 2) * radarPixels) / RADAR_SIZE;
  const radarCanvas = document.createElement('canvas');
  radarCanvas.width = Math.round(RADAR_SIZE * radarScale);
  radarCanvas.height = Math.round(RADAR_SIZE * radarScale);
  const north = document.createElement('span');
  north.className = 'radar-n';
  north.textContent = 'N';
  radar.append(radarCanvas, north);
  const radarCtx = radarCanvas.getContext('2d');
  const routeTo = createRouteCache(streets);

  const vitals = document.createElement('div');
  vitals.className = 'vitals';
  const healthLabel = document.createElement('p');
  healthLabel.className = 'health-label';
  healthLabel.textContent = 'Vida';
  const healthTrack = document.createElement('div');
  healthTrack.className = 'health-track';
  const healthFill = document.createElement('div');
  healthFill.className = 'health-fill';
  healthTrack.append(healthFill);
  vitals.append(healthLabel, healthTrack);

  const cash = document.createElement('p');
  cash.className = 'cash';
  cash.textContent = formatCash(0);

  const board = document.createElement('div');
  board.className = 'scoreboard';
  board.hidden = true;
  const scoreTitle = document.createElement('p');
  scoreTitle.className = 'score-title';
  scoreTitle.textContent = 'Estatísticas · H';
  const scoreBody = document.createElement('div');
  scoreBody.className = 'score-body';
  board.append(scoreTitle, scoreBody);

  const tags = document.createElement('div');
  tags.className = 'nametags';

  const mission = document.createElement('p');
  mission.className = 'mission';
  const prompt = document.createElement('p');
  prompt.className = 'prompt';
  const offline = document.createElement('p');
  offline.className = 'net-lost';
  offline.textContent = 'Conexão com a sala perdida · crase volta ao menu';
  offline.hidden = true;
  const speed = document.createElement('p');
  speed.className = 'speed';
  const carTitle = document.createElement('p');
  carTitle.className = 'car-title';
  const carName = document.createElement('strong');
  const carDetail = document.createElement('span');
  carTitle.append(carName, carDetail);

  const panel = document.createElement('div');
  panel.className = 'debug';
  panel.hidden = true;
  const fps = document.createElement('div');
  const draws = document.createElement('div');
  const bodies = document.createElement('div');
  const agents = document.createElement('div');
  fps.textContent = 'FPS 0';
  draws.textContent = 'Desenhos 0';
  bodies.textContent = 'Corpos 0';
  agents.textContent = 'NPC 0 · Carros 0 · Chunks 0';
  const trafficLabel = document.createElement('label');
  trafficLabel.className = 'debug-row';
  trafficLabel.textContent = 'Tráfego';
  const trafficSlider = document.createElement('input');
  trafficSlider.type = 'range';
  trafficSlider.min = '0';
  trafficSlider.max = '1';
  trafficSlider.step = '0.05';
  trafficSlider.value = String(debug.trafficDensity);
  trafficSlider.addEventListener('input', () => {
    debug.trafficDensity = Number(trafficSlider.value);
  });
  trafficLabel.append(trafficSlider);
  const pedLabel = document.createElement('label');
  pedLabel.className = 'debug-row';
  pedLabel.textContent = 'Pedestres';
  const pedSlider = document.createElement('input');
  pedSlider.type = 'range';
  pedSlider.min = '0';
  pedSlider.max = '1';
  pedSlider.step = '0.05';
  pedSlider.value = String(debug.pedDensity);
  pedSlider.addEventListener('input', () => {
    debug.pedDensity = Number(pedSlider.value);
  });
  pedLabel.append(pedSlider);
  const hintKeys = document.createElement('div');
  hintKeys.textContent = 'F3 painel · F4 ruas e navmesh';
  panel.append(fps, draws, bodies, agents, trafficLabel, pedLabel, hintKeys);

  const aimCursor = document.createElement('div');
  aimCursor.className = 'aim-cursor';
  aimCursor.hidden = true;

  const nodes = [
    offline,
    radar,
    vitals,
    cash,
    board,
    tags,
    hint,
    mission,
    prompt,
    speed,
    carTitle,
    panel,
    aimCursor,
  ];
  root.append(
    offline,
    radar,
    vitals,
    cash,
    board,
    tags,
    hint,
    mission,
    prompt,
    speed,
    carTitle,
    panel,
    aimCursor,
  );

  let frames = 0;
  let accumulated = 0;

  return {
    toggle() {
      panel.hidden = !panel.hidden;
    },
    toggleScore() {
      if (board.hidden) return;
      board.classList.toggle('is-collapsed');
    },
    setStats(drawCalls, bodyCount) {
      draws.textContent = `Desenhos ${drawCalls}`;
      bodies.textContent = `Corpos ${bodyCount}`;
      agents.textContent = `NPC ${debug.npcs} · Carros ${debug.traffic} · Chunks ${debug.chunks}`;
    },
    setLocked(locked) {
      hint.hidden = locked;
    },
    setAim(x, y, visible) {
      aimCursor.hidden = !visible;
      aimCursor.style.left = `${x}px`;
      aimCursor.style.top = `${y}px`;
    },
    setCarTitle(name, detail, x, y, visible) {
      carName.textContent = name;
      carDetail.textContent = detail;
      carTitle.style.left = `${x}px`;
      carTitle.style.top = `${y}px`;
      carTitle.classList.toggle('is-shown', visible);
    },
    setPlay(model, peers = []) {
      setText(prompt, promptLabel(model.prompt));
      setText(speed, model.driving ? `${model.speedKmh} km/h` : '');
      setText(mission, model.hasMission ? missionLabel(model.missionPhase, model.missionTime) : '');
      if (waypoint.arrived(model.x, model.z)) waypoint.clear();
      const pin = waypoint.get();
      const route = pin ? routeTo(model.x, model.z, pin.x, pin.z) : null;
      if (radarCtx) {
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
          peers,
        );
      }
      const mark = northMarker(model.heading, RADAR_SIZE / 2, RADAR_SIZE / 2, RADAR_SIZE / 2);
      north.style.left = `${mark.x}px`;
      north.style.top = `${mark.y}px`;
      const health = Math.max(0, Math.min(1, model.health / 10));
      healthFill.style.width = `${health * 100}%`;
      healthFill.dataset.level = health < 0.25 ? 'low' : health < 0.55 ? 'mid' : 'high';
      setText(cash, formatCash(model.cash));
    },
    setOffline(lost) {
      if (offline.hidden === !lost) return;
      offline.hidden = !lost;
    },
    setPresence(presence) {
      board.hidden = presence === null;
      if (!presence) {
        scoreBody.replaceChildren();
        tags.replaceChildren();
        return;
      }
      // Read the size before the roster writes, or the read forces a layout every frame.
      const width = root.clientWidth;
      const height = root.clientHeight;
      fillRoster(scoreBody, presence.roster, presence.selfId);
      while (tags.childElementCount > presence.peers.length) tags.lastElementChild?.remove();
      for (let index = 0; index < presence.peers.length; index += 1) {
        const peer = presence.peers[index];
        if (!peer) continue;
        let label = tags.children[index] as HTMLElement | undefined;
        if (!label) {
          label = document.createElement('p');
          label.className = 'name-tag';
          tags.append(label);
        }
        let mark = label.querySelector('.player-mark');
        let name = label.querySelector('.player-name');
        if (!mark || !name) {
          mark = document.createElement('span');
          mark.className = 'player-mark';
          mark.textContent = 'V';
          name = document.createElement('span');
          name.className = 'player-name';
          label.append(mark, name);
        }
        if (name instanceof HTMLElement) name.hidden = peer.driving;
        name.textContent = peer.name;
        const lift = peer.driving ? 0 : PLAYER_TAG_LIFT;
        const spot = presence.project({ x: peer.x, y: peer.y + lift, z: peer.z });
        const outside =
          spot.behind || spot.x < 0 || spot.y < 0 || spot.x > width || spot.y > height;
        label.hidden = outside;
        label.style.left = `${spot.x}px`;
        label.style.top = `${spot.y}px`;
      }
    },
    updateFps(dt) {
      frames += 1;
      accumulated += dt;
      if (accumulated < 0.25) return;
      fps.textContent = `FPS ${(frames / accumulated).toFixed(0)}`;
      frames = 0;
      accumulated = 0;
    },
    remove() {
      for (const node of nodes) node.remove();
    },
  };
}

function fillRoster(board: HTMLElement, roster: readonly NetRosterEntry[], selfId: number): void {
  while (board.childElementCount > roster.length) board.lastElementChild?.remove();
  for (let index = 0; index < roster.length; index += 1) {
    const entry = roster[index];
    if (!entry) continue;
    let row = board.children[index] as HTMLElement | undefined;
    if (!row) {
      row = document.createElement('div');
      const name = document.createElement('p');
      name.className = 'score-name';
      const players = document.createElement('p');
      players.className = 'score-detail';
      const npcs = document.createElement('p');
      npcs.className = 'score-detail';
      row.append(name, players, npcs);
      board.append(row);
    }
    row.className = entry.id === selfId ? 'score-row score-self' : 'score-row';
    const name = row.children[0] as HTMLElement;
    const players = row.children[1] as HTMLElement;
    const npcs = row.children[2] as HTMLElement;
    name.textContent = entry.name;
    players.textContent = playerScoreLine(entry.kills, entry.playerDeaths);
    npcs.textContent = npcScoreLine(entry.npcKills, entry.npcDeaths);
  }
}

function promptLabel(code: number): string {
  if (code === PromptCode.Enter) return 'W entrar';
  if (code === PromptCode.Exit) return 'W sair';
  return '';
}

function missionLabel(phase: number, time: number): string {
  if (phase === MissionPhase.Pickup) return 'Pegue a caixa amarela';
  if (phase === MissionPhase.Deliver) return `Leve a caixa até a marca  ${formatTime(time)}`;
  return `Entregue  ${formatTime(time)}`;
}

/** Text writes cost a style recalculation even when the text is the same. */
function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

export function formatTime(seconds: number): string {
  const safe = Math.round(Math.max(0, seconds) * 10) / 10;
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}
