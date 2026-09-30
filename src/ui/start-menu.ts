/** Full-screen gate. The world stays unloaded until a solo mode starts. */

import type { PauseMap } from './map-panel';
import { mountMapPanel } from './map-panel';
import { loadSettings, saveSettings, type GameSettings, type SettingsStore } from './settings';
import { parseRoomList, type RoomInfo } from '../net/protocol';

export type PlayMode = 'mission' | 'free' | 'multiplayer';

export interface LaunchChoice {
  mode: PlayMode;
  settings: GameSettings;
  roomId?: string;
  playerName?: string;
}

export interface MenuOptions {
  store?: SettingsStore;
  /** Closes the overlay and returns to the running game. */
  resume?: () => void;
  onSettings?: (settings: GameSettings) => void;
  map?: PauseMap;
}

export interface StartMenu {
  /** Removes the overlay. Returns false while a mode is still loading. */
  close(): boolean;
}

const GEAR_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.48.48 0 0 0 .12-.61l-1.92-3.32a.48.48 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.47.47 0 0 0-.47.41L9.25 5.35c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.48.48 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 15.6 12 3.6 3.6 0 0 1 12 15.6Z" />
</svg>`;

export function mountStartMenu(
  root: HTMLElement,
  play: (choice: LaunchChoice) => Promise<void>,
  options?: MenuOptions,
): StartMenu {
  const settings = loadSettings(options?.store);
  const menu = document.createElement('div');
  menu.className = 'menu';

  const card = document.createElement('div');
  card.className = 'menu-card';

  const kicker = document.createElement('p');
  kicker.className = 'menu-kicker';
  kicker.textContent = 'Costa Verde';

  const title = document.createElement('h1');
  title.className = 'menu-title';
  title.textContent = 'Bairro';

  const lead = document.createElement('p');
  lead.className = 'menu-lead';
  lead.textContent = 'Ilha brasileira à beira-mar. Praia, morro colorido e centro.';

  const home = document.createElement('div');
  home.className = 'menu-panel menu-home';
  const settingsPanel = document.createElement('div');
  settingsPanel.className = 'menu-panel';
  settingsPanel.hidden = true;

  const status = document.createElement('p');
  status.className = 'menu-status';

  const inGame = options?.resume !== undefined;
  const mission = modeButton('Com missão', !inGame);
  const free = modeButton('Sem missão', false);
  const resume = document.createElement('button');
  resume.type = 'button';
  resume.className = 'menu-play';
  resume.textContent = 'Continuar';
  resume.hidden = !inGame;
  const multi = modeButton('Multijogador', false);
  multi.hidden = inGame;

  const mapView = options?.map;
  const openMap = document.createElement('button');
  openMap.type = 'button';
  openMap.className = 'menu-play menu-secondary';
  openMap.textContent = 'Mapa';
  openMap.hidden = mapView === undefined;

  const openSettings = document.createElement('button');
  openSettings.type = 'button';
  openSettings.className = 'menu-gear';
  openSettings.title = 'Configurações';
  openSettings.setAttribute('aria-label', 'Configurações');
  openSettings.innerHTML = GEAR_ICON;

  const playable = [mission, free, resume, multi];
  let busy = false;
  let gone = false;
  let poll = 0;

  const serversPanel = document.createElement('div');
  serversPanel.className = 'menu-panel';
  serversPanel.hidden = true;
  const serverList = document.createElement('div');
  serverList.className = 'menu-servers';
  const serverStatus = document.createElement('p');
  serverStatus.className = 'menu-status';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 16;
  nameInput.setAttribute('autocomplete', 'nickname');
  nameInput.spellcheck = false;
  nameInput.placeholder = 'opcional';

  const stopPoll = () => {
    if (poll === 0) return;
    window.clearInterval(poll);
    poll = 0;
  };

  const close = () => {
    if (busy || gone) return false;
    gone = true;
    stopPoll();
    menu.remove();
    return true;
  };

  const launch = (mode: PlayMode, roomId?: string) => {
    if (busy) return;
    busy = true;
    stopPoll();
    for (const button of playable) button.disabled = true;
    for (const button of serverList.querySelectorAll('button')) button.disabled = true;
    openSettings.disabled = true;
    openMap.disabled = true;
    mission.textContent = mode === 'mission' ? 'Abrindo a cidade...' : 'Com missão';
    free.textContent = mode === 'free' ? 'Abrindo a cidade...' : 'Sem missão';
    multi.textContent = mode === 'multiplayer' ? 'Entrando...' : 'Multijogador';
    status.textContent = '';
    const choice: LaunchChoice = { mode, settings: { ...settings } };
    if (roomId) choice.roomId = roomId;
    if (mode === 'multiplayer') choice.playerName = nameInput.value;
    void play(choice)
      .then(() => {
        gone = true;
        menu.remove();
      })
      .catch((error: unknown) => {
        busy = false;
        mission.disabled = false;
        free.disabled = false;
        resume.disabled = false;
        multi.disabled = false;
        openSettings.disabled = false;
        openMap.disabled = false;
        mission.textContent = 'Com missão';
        free.textContent = 'Sem missão';
        multi.textContent = 'Multijogador';
        status.textContent = error instanceof Error ? error.message : 'Falha ao iniciar';
        serverStatus.textContent = status.textContent;
        if (!serversPanel.hidden) {
          void refreshServers();
          stopPoll();
          poll = window.setInterval(() => {
            void refreshServers();
          }, 2000);
        }
      });
  };

  mission.addEventListener('click', () => {
    launch('mission');
  });
  free.addEventListener('click', () => {
    launch('free');
  });
  resume.addEventListener('click', () => {
    if (!close()) return;
    options?.resume?.();
  });

  home.append(resume, mission, free, openMap, multi, status);

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

  openMap.addEventListener('click', () => {
    if (!mapPanel) return;
    stopPoll();
    home.hidden = true;
    settingsPanel.hidden = true;
    serversPanel.hidden = true;
    mapPanel.hidden = false;
    openSettings.hidden = true;
    mapBack.focus();
  });

  const sensitivity = sliderField('Sensibilidade do rato', settings.mouseScale, 0.4, 2.5, 0.05);
  const volume = sliderField('Volume', settings.volume, 0, 1, 0.05);
  const shadows = selectField('Sombras', settings.shadows, [
    ['off', 'Desligadas'],
    ['low', 'Baixas'],
    ['high', 'Altas'],
  ]);
  const sharpness = selectField('Nitidez', settings.sharpness, [
    ['low', 'Baixa'],
    ['medium', 'Média'],
    ['high', 'Alta'],
  ]);

  const persist = () => {
    settings.mouseScale = Number(sensitivity.input.value);
    settings.volume = Number(volume.input.value);
    settings.shadows = shadows.input.value as GameSettings['shadows'];
    settings.sharpness = sharpness.input.value as GameSettings['sharpness'];
    sensitivity.value.textContent = percent(settings.mouseScale);
    volume.value.textContent = percent(settings.volume);
    saveSettings(settings, options?.store);
    options?.onSettings?.({ ...settings });
  };

  sensitivity.input.addEventListener('input', persist);
  volume.input.addEventListener('input', persist);
  shadows.input.addEventListener('change', persist);
  sharpness.input.addEventListener('change', persist);

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'menu-play menu-secondary';
  back.textContent = 'Voltar';
  back.addEventListener('click', () => {
    settingsPanel.hidden = true;
    home.hidden = false;
    openSettings.hidden = false;
    if (inGame) resume.focus();
    else mission.focus();
  });

  openSettings.addEventListener('click', () => {
    stopPoll();
    home.hidden = true;
    settingsPanel.hidden = false;
    serversPanel.hidden = true;
    if (mapPanel) mapPanel.hidden = true;
    openSettings.hidden = true;
    sensitivity.input.focus();
  });

  const settingsTitle = document.createElement('p');
  settingsTitle.className = 'menu-section';
  settingsTitle.textContent = 'Configurações';

  settingsPanel.append(
    settingsTitle,
    sensitivity.field,
    volume.field,
    shadows.field,
    sharpness.field,
    back,
  );

  const serverTitle = document.createElement('p');
  serverTitle.className = 'menu-section';
  serverTitle.textContent = 'Servidores';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'menu-field';
  const nameCaption = document.createElement('span');
  nameCaption.textContent = 'Nome';
  nameLabel.append(nameCaption, nameInput);
  const serverBack = document.createElement('button');
  serverBack.type = 'button';
  serverBack.className = 'menu-play menu-secondary';
  serverBack.textContent = 'Voltar';
  serverBack.addEventListener('click', () => {
    stopPoll();
    serversPanel.hidden = true;
    home.hidden = false;
    openSettings.hidden = false;
    mission.focus();
  });
  serversPanel.append(serverTitle, nameLabel, serverList, serverStatus, serverBack);
  multi.addEventListener('click', () => {
    home.hidden = true;
    settingsPanel.hidden = true;
    if (mapPanel) mapPanel.hidden = true;
    serversPanel.hidden = false;
    openSettings.hidden = true;
    void refreshServers();
    stopPoll();
    poll = window.setInterval(() => {
      void refreshServers();
    }, 2000);
    serverBack.focus();
  });

  card.append(kicker, title, lead, home);
  if (mapPanel) card.append(mapPanel);
  card.append(serversPanel, settingsPanel, openSettings);
  menu.append(card);
  root.append(menu);
  if (inGame) resume.focus();
  else mission.focus();

  async function refreshServers(): Promise<void> {
    try {
      const response = await fetch('/rooms');
      if (!response.ok) throw new Error('offline');
      const rooms = parseRoomList(await response.json());
      if (rooms.length === 0) throw new Error('empty');
      serverList.replaceChildren(...rooms.map((room) => serverButton(room)));
      serverStatus.textContent = '';
    } catch {
      serverStatus.textContent = 'Não foi possível ver os servidores';
    }
  }

  function serverButton(room: RoomInfo): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-play menu-secondary menu-server';
    const name = document.createElement('span');
    name.textContent = room.name;
    const count = document.createElement('span');
    count.className = 'menu-count';
    const full = room.players >= room.max;
    count.textContent = full
      ? 'Sala cheia'
      : room.players === 1
        ? '1 pessoa'
        : `${room.players} pessoas`;
    button.append(name, count);
    button.disabled = full || busy;
    button.addEventListener('click', () => {
      launch('multiplayer', room.id);
    });
    return button;
  }

  function modeButton(label: string, primary: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = primary ? 'menu-play' : 'menu-play menu-secondary';
    button.textContent = label;
    return button;
  }

  return { close };
}

function percent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

function sliderField(
  label: string,
  initial: number,
  min: number,
  max: number,
  step: number,
): { field: HTMLLabelElement; input: HTMLInputElement; value: HTMLSpanElement } {
  const field = document.createElement('label');
  field.className = 'menu-field';
  const head = document.createElement('span');
  head.className = 'menu-field-head';
  const name = document.createElement('span');
  name.textContent = label;
  const value = document.createElement('span');
  value.textContent = percent(initial);
  head.append(name, value);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);
  field.append(head, input);
  return { field, input, value };
}

function selectField(
  label: string,
  initial: string,
  options: Array<[string, string]>,
): { field: HTMLLabelElement; input: HTMLSelectElement } {
  const field = document.createElement('label');
  field.className = 'menu-field';
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('select');
  for (const [value, text] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    option.selected = value === initial;
    input.append(option);
  }
  field.append(name, input);
  return { field, input };
}
