import { describe, expect, it } from 'vitest';
import { isMenuChord } from '../ui/menu-key';

describe('menu key', () => {
  it('opens on a single US backtick', () => {
    expect(isMenuChord('`', 'Backquote')).toBe(true);
  });

  it('opens on the first ABNT2 crase press, before a character exists', () => {
    expect(isMenuChord('Dead', 'BracketLeft')).toBe(true);
  });

  it('ignores other dead keys', () => {
    expect(isMenuChord('Dead', 'Quote')).toBe(false);
    expect(isMenuChord('Dead', 'Backslash')).toBe(false);
    expect(isMenuChord('a', 'KeyA')).toBe(false);
  });
});
