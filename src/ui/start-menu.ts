/** Full-screen gate. The world stays unloaded until Jogar. */

export function mountStartMenu(root: HTMLElement, play: () => Promise<void>): void {
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

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'menu-play';
  button.textContent = 'Jogar';

  const controls = document.createElement('ul');
  controls.className = 'menu-controls';
  for (const line of [
    'Setas mover e dirigir',
    'Mouse olhar',
    'Scroll aproximar',
    'S segurar correr',
    'S toque ataque forte',
    'A pular',
    'D ataque leve',
    'W entrar no carro',
    'Espaço freio de mão',
  ]) {
    const item = document.createElement('li');
    item.textContent = line;
    controls.append(item);
  }

  const status = document.createElement('p');
  status.className = 'menu-status';

  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Abrindo a cidade...';
    status.textContent = '';
    void play()
      .then(() => {
        menu.remove();
      })
      .catch((error: unknown) => {
        button.disabled = false;
        button.textContent = 'Jogar';
        status.textContent = error instanceof Error ? error.message : 'Falha ao iniciar';
      });
  });

  card.append(kicker, title, lead, button, controls, status);
  menu.append(card);
  root.append(menu);
  button.focus();
}
