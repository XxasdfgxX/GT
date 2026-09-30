/**
 * US keyboards emit "`" from Backquote in one press.
 * ABNT2 puts crase on the ´ key, right of P. That key is dead: the first press
 * reports "Dead" and only a second press would insert the character.
 */

export function isMenuChord(key: string, code: string): boolean {
  if (key === '`' || code === 'Backquote') return true;
  return key === 'Dead' && code === 'BracketLeft';
}
