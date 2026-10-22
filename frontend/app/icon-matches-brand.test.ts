import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');

function pathsOf(text: string): string[] {
  return [...text.matchAll(/d="(M[^"]+)"|'(M[^']+)'/g)].map((match) => match[1] ?? match[2]);
}

describe('app icon', () => {
  it('draws the same Y mark as the brand component, so the favicon and the logo never differ', () => {
    const icon = readFileSync(join(ROOT, 'app', 'icon.svg'), 'utf8');
    const brand = readFileSync(join(ROOT, 'components', 'brand', 'y-mark.tsx'), 'utf8');

    expect(pathsOf(icon)).toHaveLength(2);
    expect(pathsOf(icon)).toEqual(pathsOf(brand));
  });

  it('uses the primary colour of the brand', () => {
    const icon = readFileSync(join(ROOT, 'app', 'icon.svg'), 'utf8');

    expect(icon).toContain('fill="#4f46e5"');
  });
});
