/** DOM readout. Gameplay never touches document nodes directly. */

import type { CostaVerde } from '../content/city';
import type { HudModel } from '../game/play/read-hud';
import { MissionPhase } from '../game/play/mission';
import { PromptCode } from '../game/play/prompt';
import { bakeRadarMap, drawRadar, missionBlip, northMarker, RADAR_SIZE } from './radar-map';

export interface Hud {
  toggle(): void;
  setStats(draws: number, bodies: number): void;
  setLocked(locked: boolean): void;
  setPlay(model: HudModel): void;
  updateFps(dt: number): void;
}

export function mountHud(root: HTMLElement, city: CostaVerde): Hud {
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent =
    'Clique para o mouse · Setas mover · S segurar correr · S toque ataque forte · A pular · D ataque leve · W carro · Espaço freio · Scroll zoom';

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
  const radarMap = bakeRadarMap(city);
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
  fps.textContent = 'FPS 0';
  draws.textContent = 'Desenhos 0';
  bodies.textContent = 'Corpos 0';
  panel.append(fps, draws, bodies);
  root.append(radar, vitals, hint, mission, prompt, speed, panel);

  let frames = 0;
  let accumulated = 0;

  return {
    toggle() {
      panel.hidden = !panel.hidden;
    },
    setStats(drawCalls, bodyCount) {
      draws.textContent = `Desenhos ${drawCalls}`;
      bodies.textContent = `Corpos ${bodyCount}`;
    },
    setLocked(locked) {
      hint.hidden = locked;
    },
    setPlay(model) {
      prompt.textContent = promptLabel(model.prompt);
      speed.textContent = model.driving ? `${model.speedKmh} km/h` : '';
      mission.textContent = missionLabel(model.missionPhase, model.missionTime);
      if (radarCtx) {
        drawRadar(
          radarCtx,
          radarMap,
          model.x,
          model.z,
          model.heading,
          missionBlip(model.missionPhase),
          radarScale,
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
