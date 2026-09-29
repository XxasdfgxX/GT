/** Browser entry. Shows a startup error in the page if the engine fails to boot. */

import './ui/hud.css';
import { start } from './app/bootstrap';
import { mountStartMenu } from './ui/start-menu';

const root = document.querySelector('#app');
if (!(root instanceof HTMLElement)) {
  throw new Error('Elemento #app ausente');
}

mountStartMenu(root, () => start(root));
