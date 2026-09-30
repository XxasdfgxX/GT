/** One scoreboard row. Plurals follow the in-game example. */

export function scoreLine(name: string, kills: number, deaths: number): string {
  const killWord = kills === 1 ? 'kill' : 'kills';
  const deathWord = deaths === 1 ? 'death' : 'deaths';
  return `${name} — ${kills} ${killWord}, ${deaths} ${deathWord}`;
}
