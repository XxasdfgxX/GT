/** Collision membership. High 16 bits are membership, low 16 bits are the filter mask. */

export const Membership = {
  world: 0x0001,
  player: 0x0002,
  vehicle: 0x0004,
} as const;

export function interactionGroups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export const Groups = {
  world: interactionGroups(Membership.world, 0xffff),
  player: interactionGroups(Membership.player, Membership.world | Membership.vehicle),
  vehicle: interactionGroups(
    Membership.vehicle,
    Membership.world | Membership.player | Membership.vehicle,
  ),
  wheelRay: interactionGroups(Membership.vehicle, Membership.world),
};
