/** Starts the Vite game and the room server, and stops both together. */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const node = process.execPath;
const ports = [
  { port: 8787, name: 'salas' },
  { port: 6969, name: 'jogo' },
];

const jobs = [
  {
    name: 'salas',
    args: ['--experimental-strip-types', '--import', './server/register.mjs', 'server/index.ts'],
  },
  {
    name: 'jogo',
    args: ['node_modules/vite/bin/vite.js'],
  },
];

await freePorts();

const children = jobs.map((job) => {
  const child = spawn(node, job.args, { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (stopping || signal) return;
    console.error(`[${job.name}] encerrou (${code ?? 0})`);
    stop();
  });
  return child;
});

let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

async function freePorts() {
  for (const { port, name } of ports) {
    for (const pid of await listeningPids(port)) {
      console.info(`[play] encerrando ${name} antigo (pid ${pid}, porta ${port})`);
      await killPid(pid);
    }
  }

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const busy = [];
    for (const { port } of ports) {
      if ((await listeningPids(port)).length > 0) busy.push(port);
    }
    if (busy.length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('[play] as portas 6969 e 8787 continuam ocupadas');
}

async function listeningPids(port) {
  if (process.platform === 'win32') return windowsListeners(port);
  return unixListeners(port);
}

async function windowsListeners(port) {
  const { stdout } = await execFileAsync('netstat.exe', ['-ano'], { windowsHide: true });
  const pids = new Set();
  const marker = `:${port}`;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.includes('LISTENING')) continue;
    const columns = line.trim().split(/\s+/);
    const local = columns[1] ?? '';
    if (!local.endsWith(marker)) continue;
    const pid = Number(columns.at(-1));
    if (pid > 0 && pid !== process.pid) pids.add(pid);
  }
  return [...pids];
}

async function unixListeners(port) {
  try {
    const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
    return [
      ...new Set(
        stdout
          .split(/\s+/)
          .map(Number)
          .filter((pid) => pid > 0 && pid !== process.pid),
      ),
    ];
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 1) return [];
    throw error;
  }
}

async function killPid(pid) {
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill.exe', ['/F', '/T', '/PID', String(pid)], { windowsHide: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('not found') && !message.includes('não foi encontrado')) throw error;
    }
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH') return;
    throw error;
  }
}
