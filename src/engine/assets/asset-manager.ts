/** Owns disposable GPU resources created for the session and frees them together. */

import type { Disposable } from '../core/disposable';

export class AssetManager implements Disposable {
  private readonly owned: Disposable[] = [];

  track<T extends Disposable>(resource: T): T {
    this.owned.push(resource);
    return resource;
  }

  dispose(): void {
    for (const resource of this.owned) resource.dispose();
    this.owned.length = 0;
  }
}
