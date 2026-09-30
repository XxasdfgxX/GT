/** One local player walks to a door at a time. Solo only. */

export type BoardKind = 'player' | 'traffic';
export type BoardPhase = 'walk' | 'sit';

export interface BoardJob {
  player: number;
  ride: number;
  kind: BoardKind;
  phase: BoardPhase;
  time: number;
  fromX: number;
  fromZ: number;
  doorX: number;
  doorZ: number;
  locked: boolean;
}

let job: BoardJob | null = null;

export function armBoard(player: number, ride: number, kind: BoardKind): void {
  job = {
    player,
    ride,
    kind,
    phase: 'walk',
    time: 0,
    fromX: 0,
    fromZ: 0,
    doorX: 0,
    doorZ: 0,
    locked: false,
  };
}

export function currentBoard(): BoardJob | null {
  return job;
}

export function clearBoard(): void {
  job = null;
}
