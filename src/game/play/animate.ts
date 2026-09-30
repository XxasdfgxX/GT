/** Which clip the body plays, and how long a punch stays active. */

export type ClipKey = 'idle' | 'walk' | 'run' | 'punch' | 'jump' | 'die' | 'sit';

export function chooseClip(
  speed: number,
  sprinting: boolean,
  airborne: boolean,
  punching: boolean,
): ClipKey {
  if (punching) return 'punch';
  if (airborne) return 'jump';
  if (speed < 0.25) return 'idle';
  if (sprinting) return 'run';
  return 'walk';
}

export function stepAction(
  remaining: number,
  pressed: boolean,
  dt: number,
  duration: number,
): number {
  if (pressed) return duration;
  return Math.max(0, remaining - dt);
}
