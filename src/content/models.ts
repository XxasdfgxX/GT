/** Presentation models. Physics stays on the capsule and the raycast car. */

export const characterModel = '/assets/character.glb';
export const carModel = '/assets/car.glb';

/** Quaternius humans are exported at 100x. This scale matches the player capsule. */
export const characterScale = 0.37;
export const characterAlignYaw = Math.PI;

export const characterClips = {
  idle: 'HumanArmature|Man_Idle',
  walk: 'HumanArmature|Man_Walk',
  run: 'HumanArmature|Man_Run',
  punch: 'HumanArmature|Man_Punch',
  jump: 'HumanArmature|Man_Jump',
} as const;

const maleClips = {
  ...characterClips,
  die: 'HumanArmature|Man_Death',
  sit: 'HumanArmature|Man_Sitting',
} as const;

const femaleClips = {
  idle: 'HumanArmature|Female_Idle',
  walk: 'HumanArmature|Female_Walk',
  run: 'HumanArmature|Female_Run',
  punch: 'HumanArmature|Female_Punch',
  jump: 'HumanArmature|Female_Jump',
  die: 'HumanArmature|Female_Death',
  sit: 'HumanArmature|Female_Sitting',
} as const;

/** Same rig and scale as the player. Four men and four women, the full CC0 sets. */
export const citizens = [
  { url: characterModel, clips: maleClips },
  { url: '/assets/people/man-tee.glb', clips: maleClips },
  { url: '/assets/people/man-shirt.glb', clips: maleClips },
  { url: '/assets/people/man-sleeves.glb', clips: maleClips },
  { url: '/assets/people/woman-casual.glb', clips: femaleClips },
  { url: '/assets/people/woman-tank.glb', clips: femaleClips },
  { url: '/assets/people/woman-street.glb', clips: femaleClips },
  { url: '/assets/people/woman-dress.glb', clips: femaleClips },
] as const;
