/** DOM readout. Gameplay never touches document nodes directly. */

import { sim } from '../content/sim';
import type { DebugState, NetPlayer, NetRosterEntry } from '../engine/core/context';
import type { Vec3 } from '../engine/core/math';
import type { HudModel } from '../game/play/read-hud';
import { formatCash } from '../game/play/wallet';
import { MissionPhase } from '../game/play/mission';
import { PromptCode } from '../game/play/prompt';
import type { RadarMap, WorldPoint } from './radar-map';
import { drawRadar, missionBlip, northMarker, RADAR_SIZE } from './radar-map';
import { routeOnStreets, type StreetIndex } from './street-route';
import { npcScoreLine, playerScoreLine } from './score-line';
import type { Waypoint } from './waypoint';

const HEAD_LIFT = sim.playerHalfHeight + sim.playerRadius + 0.35;

export interface Presence {
  selfId: number;
  roster: readonly NetRosterEntry[];
  peers: readonly NetPlayer[];
  project: (point: Vec3) => { x: number; y: number; behind: boolean };
}

export interface Hud {
  toggle(): void;
  toggleScore(): void;
  setStats(draws: number, bodies: number): void;
  setLocked(locked: boolean): void;
  setPlay(model: HudModel, peers?: readonly WorldPoint[]): void;
  setPresence(presence: Presence | null): void;
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
    'Clique para o mouse · Setas mover · S segurar correr · S toque ataque forte · A pular · D ataque leve · W carro · Espaço freio · Scroll zoom · crase menu';

  const radar = document.createElement('div');
  radar.className = 'radar';
  const radarScale = Math.min(window.devicePixelRatio || 1, 2);
  const radarCanvas = document.createElement('canvas');
  radarCanvas.width = Math.round(RADAR_SIZE * radarScale);
  radarCanvas.height = Math.round(RADAR_SIZE * radarScale);
  const north = document.createElement('span');
  north.className = 'radar-n';
  north.textContent = 'N';
  radar.append(radarCanvas, north);
  const radarCtx = radarCanvas.getContext('2d');

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
  const speed = document.createElement('p');
  speed.className = 'speed';

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

  const nodes = [radar, vitals, cash, board, tags, hint, mission, prompt, speed, panel];
  root.append(radar, vitals, cash, board, tags, hint, mission, prompt, speed, panel);

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
    setPlay(model, peers = []) {
      prompt.textContent = promptLabel(model.prompt);
      speed.textContent = model.driving ? `${model.speedKmh} km/h` : '';
      mission.textContent = model.hasMission
        ? missionLabel(model.missionPhase, model.missionTime)
        : '';
      if (waypoint.arrived(model.x, model.z)) waypoint.clear();
      const pin = waypoint.get();
      const route = pin ? routeOnStreets(streets, model.x, model.z, pin.x, pin.z) : null;
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
      cash.textContent = formatCash(model.cash);
    },
    setPresence(presence) {
      board.hidden = presence === null;
      if (!presence) {
        scoreBody.replaceChildren();
        tags.replaceChildren();
        return;
      }
      fillRoster(scoreBody, presence.roster, presence.selfId);
      const width = root.clientWidth;
      const height = root.clientHeight;
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
        label.textContent = peer.name;
        const spot = presence.project({ x: peer.x, y: peer.y + HEAD_LIFT, z: peer.z });
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

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}
