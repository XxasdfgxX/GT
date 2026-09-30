/** Street pieces: asphalt, sidewalks, climbable curbs, and a dashed center line. */

import type { MapContent } from '../../../content/schemas';

export type RoadRole = 'asphalt' | 'sidewalk' | 'curb' | 'lane';

export interface RoadPiece {
  role: RoadRole;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
  collide: boolean;
}

type Road = MapContent['road'];

export function roadPieces(road: Road): RoadPiece[] {
  const alongX = road.axis === 'x';
  const length = road.z1 - road.z0;
  const along = (road.z0 + road.z1) / 2;
  const cross = road.x;
  const curbWidth = 0.28;
  const sidewalkWidth = 5.2;
  const pieces: RoadPiece[] = [
    piece('asphalt', along, cross, length, road.width, 0.035, 0.04, road.asphalt, false, alongX),
  ];
  const curbOffset = road.width / 2 + curbWidth / 2;
  const walkOffset = road.width / 2 + curbWidth + sidewalkWidth / 2;
  for (const side of [-1, 1]) {
    pieces.push(
      piece(
        'curb',
        along,
        cross + side * curbOffset,
        length,
        curbWidth,
        0.06,
        0.12,
        road.curb,
        true,
        alongX,
      ),
    );
    pieces.push(
      piece(
        'sidewalk',
        along,
        cross + side * walkOffset,
        length,
        sidewalkWidth,
        0.045,
        0.08,
        road.sidewalk,
        false,
        alongX,
      ),
    );
  }
  const dashLength = 1.4;
  const step = 4;
  for (let cursor = road.z0 + 1; cursor < road.z1 - dashLength; cursor += step) {
    pieces.push(
      piece(
        'lane',
        cursor + dashLength / 2,
        cross,
        dashLength,
        0.16,
        0.05,
        0.012,
        road.lane,
        false,
        alongX,
      ),
    );
  }
  return pieces;
}

function piece(
  role: RoadRole,
  along: number,
  cross: number,
  alongSize: number,
  crossSize: number,
  y: number,
  sy: number,
  color: number,
  collide: boolean,
  alongX: boolean,
): RoadPiece {
  return {
    role,
    x: alongX ? along : cross,
    y,
    z: alongX ? cross : along,
    sx: alongX ? alongSize : crossSize,
    sy,
    sz: alongX ? crossSize : alongSize,
    color,
    collide,
  };
}
