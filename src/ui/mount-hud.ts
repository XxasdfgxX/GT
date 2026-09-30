/** DOM readout. Gameplay never touches document nodes directly. */

import type { DebugState } from '../engine/core/context';
import type { HudModel } from '../game/play/read-hud';
import { MissionPhase } from '../game/play/mission';
import { PromptCode } from '../game/play/prompt';
import type { RadarMap } from './radar-map';
import { drawRadar, missionBlip, northMarker, RADAR_SIZE } from './radar-map';
import { routeOnStreets, type StreetIndex } from './street-route';
import type { Waypoint } from './waypoint';

export interface Hud {
  toggle(): void;
  setStats(draws: number, bodies: number): void;
  setLocked(locked: boolean): void;
  setPlay(model: HudModel): void;
  updateFps(dt: number): void;
  remove(): void;
}

export function mountHud(
  root: HTMLElement,
  map: RadarMap,
  streets: StreetIndex,
  waypoint: Waypoint,
  onMenu: () => void,
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

  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'menu-toggle';
  menuButton.textContent = 'Menu';
  menuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    onMenu();
  });

  const nodes = [radar, vitals, hint, mission, prompt, speed, panel, menuButton];
  root.append(radar, vitals, hint, mission, prompt, speed, panel, menuButton);

  let frames = 0;
  let accumulated = 0;

  return {
    toggle() {
      panel.hidden = !panel.hidden;
    },
    setStats(drawCalls, bodyCount) {
      draws.textContent = `Desenhos ${drawCalls}`;
      bodies.textContent = `Corpos ${bodyCount}`;
      agents.textContent = `NPC ${debug.npcs} · Carros ${debug.traffic} · Chunks ${debug.chunks}`;
    },
    setLocked(locked) {
      hint.hidden = locked;
    },
    setPlay(model) {
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
        );
      }
      const mark = northMarker(model.heading, RADAR_SIZE / 2, RADAR_SIZE / 2, RADAR_SIZE / 2);
      north.style.left = `${mark.x}px`;
      north.style.top = `${mark.y}px`;
      const health = Math.max(0, Math.min(100, model.health));
      healthFill.style.width = `${health}%`;
      healthFill.dataset.level = health < 25 ? 'low' : health < 55 ? 'mid' : 'high';
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
