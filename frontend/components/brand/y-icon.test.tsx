import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { YIcon, type YIconName } from './y-icon';

const NAVIGATION_ICONS: YIconName[] = [
  'home',
  'home-filled',
  'search',
  'bell',
  'mail',
  'bookmark',
  'user',
  'circle-ellipsis',
  'menu',
  'plus',
  'x',
  'settings',
  'log-out',
  'info',
];

describe('YIcon (navigation icons)', () => {
  it.each(NAVIGATION_ICONS)('draws the %s icon as a decorative svg', (name) => {
    const { container } = render(<YIcon name={name} />);
    const svg = container.querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.innerHTML.length).toBeGreaterThan(0);
  });
});
