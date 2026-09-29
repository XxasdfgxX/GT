/** Presentation models. Physics stays on the capsule and the raycast car. */

export const characterModel = '/assets/character.glb';
export const carModel = '/assets/car.glb';

export const characterClips = {
  idle: 'HumanArmature|Man_Idle',
  walk: 'HumanArmature|Man_Walk',
  run: 'HumanArmature|Man_Run',
  punch: 'HumanArmature|Man_Punch',
  jump: 'HumanArmature|Man_Jump',
} as const;
