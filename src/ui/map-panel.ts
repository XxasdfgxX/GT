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
