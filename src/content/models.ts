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
  sit: 'HumanArmature|Man_Sitting',
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

const rigged = { scale: characterScale, lift: 0 } as const;

/** Quaternius bodies are about this tall once characterScale is applied. */
const citizenHeight = 4.845 * characterScale;

/**
 * Casual Green Leaf Look is already in meters. The origin sits near the waist,
 * so lift raises the feet onto the same street line as the rigged citizens.
 */
const leafMeshHeight = 1.8983;
const leafFeet = 0.9503;
const leafScale = citizenHeight / leafMeshHeight;
const leafLift = leafFeet * leafScale;

/** Same rig and scale as the player, except the static leaf outfit. */
export const citizens = [
  { url: characterModel, clips: maleClips, ...rigged },
  { url: '/assets/people/man-tee.glb', clips: maleClips, ...rigged },
  { url: '/assets/people/man-shirt.glb', clips: maleClips, ...rigged },
  { url: '/assets/people/man-sleeves.glb', clips: maleClips, ...rigged },
  { url: '/assets/people/woman-leaf.glb', clips: {}, scale: leafScale, lift: leafLift },
  { url: '/assets/people/woman-tank.glb', clips: femaleClips, ...rigged },
  { url: '/assets/people/woman-street.glb', clips: femaleClips, ...rigged },
  { url: '/assets/people/woman-dress.glb', clips: femaleClips, ...rigged },
] as const;
