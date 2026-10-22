import { afterEach, describe, expect, it, vi } from 'vitest';
import { characterModel } from '../content/models';
import type { GameContext, NetCorpse, NetPickup } from '../engine/core/context';
import type { ModelDesc, Renderer } from '../engine/render/renderer';
import { resetRemotes, syncRemotes } from '../game/features/net/remotes';
import { connectRoom } from '../net/session';

function recordingRenderer() {
  const models: string[] = [];
  let meshes = 0;
  let next = 0;
  const renderer = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'addModel') {
          return (desc: ModelDesc) => {
            models.push(desc.url);
            return (next += 1);
          };
        }
        if (key === 'addMesh') {
          return () => {
            meshes += 1;
            return (next += 1);
          };
        }
        return () => (next += 1);
      },
    },
  ) as unknown as Renderer;
  const ctx = { renderer, net: null } as unknown as GameContext;
  return { ctx, models, meshCount: () => meshes };
}

function corpse(id: number, kind: number, variant: number): NetCorpse {
  return { id, kind, variant, x: 0, y: 0, z: 0, yaw: 0 };
}

function cash(id: number): NetPickup {
  return { id, x: 0, y: 0, z: 0, amount: 10 };
}

describe('remote ghosts', () => {
  it('reuses the mesh of a gone body or drop instead of adding one per id', () => {
    resetRemotes();
    const { ctx, models, meshCount } = recordingRenderer();
    const frame = (corpses: NetCorpse[], pickups: NetPickup[]) =>
      syncRemotes(ctx, [], [], [], pickups, corpses, 0, 1 / 60);
    frame([corpse(1, 1, 2)], [cash(1)]);
    const after = { models: models.length, meshes: meshCount() };
    for (let id = 2; id <= 50; id += 1) {
      frame([], []);
      frame([corpse(id, 1, 2)], [cash(id)]);
    }
    expect(models.length).toBe(after.models);
    expect(meshCount()).toBe(after.meshes);
  });

  it('dresses a player body in the player model, whatever the variant says', () => {
    resetRemotes();
    const { ctx, models } = recordingRenderer();
    syncRemotes(ctx, [], [], [], [], [corpse(1, 0, 3)], 0, 1 / 60);
    expect(models).toEqual([characterModel]);
  });
});

class FakeSocket extends EventTarget {
  static last: FakeSocket | null = null;
  static readonly OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  constructor(public url: string) {
    super();
    FakeSocket.last = this;
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
  receive(data: string): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
  drop(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
}

describe('room session', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a dropped socket after the welcome instead of going quiet', async () => {
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:6969' });
    const joining = connectRoom('costa-1', 'Ana');
    FakeSocket.last?.receive(
      JSON.stringify({ type: 'welcome', id: 3, x: 0, y: 2, z: 0, placeSerial: 1 }),
    );
    const { link } = await joining;
    expect(link.connected()).toBe(true);
    FakeSocket.last?.drop();
    expect(link.connected()).toBe(false);
  });
});
