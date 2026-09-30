/** Scoreboard lines. Player fights and npc fights stay on separate rows. */

export function playerScoreLine(kills: number, deaths: number): string {
  return `Jogadores: ${countWord(kills, 'abate', 'abates')}, ${countWord(deaths, 'morte', 'mortes')}`;
}

export function npcScoreLine(kills: number, deaths: number): string {
  return `NPCs: ${countWord(kills, 'abate', 'abates')}, ${countWord(deaths, 'morte', 'mortes')}`;
}

function countWord(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
