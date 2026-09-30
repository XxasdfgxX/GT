/** Walkable surface. Implementations may use a navmesh library; callers pass polygons. */

export interface NavQuad {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  cx: number;
  cz: number;
  dx: number;
  dz: number;
  y: number;
}

export interface NavMesh {
  load(quads: readonly NavQuad[]): void;
  /**
   * Writes xz waypoints into outX/outZ at `offset`. Returns how many points were written,
   * at most `cap`.
   */
  find(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    outX: Float32Array,
    outZ: Float32Array,
    offset: number,
    cap: number,
  ): number;
}
