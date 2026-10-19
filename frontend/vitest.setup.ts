import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Vitest runs without globals here, so unmount between tests explicitly.
afterEach(() => {
  cleanup();
});
