import type { CSSProperties } from 'react';

/*
 * The colour of the destructive actions of the settings (deleting the account). The design-system red gives 3,76:1 with
 * white text, under the 4,5:1 of WCAG AA; this darker red gives about 6,5:1 and keeps the same shape.
 */
export const DESTRUCTIVE: CSSProperties = {
  background: '#b91c1c',
  borderColor: '#b91c1c',
  color: '#ffffff',
};
