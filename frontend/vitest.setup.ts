import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL doesn't auto-cleanup under Vitest (unlike Jest) — without this, a
// component rendered in one test is still in the DOM for the next one,
// producing false "multiple elements found" failures.
afterEach(() => {
  cleanup();
});

// jsdom has no matchMedia implementation; Ant Design's responsive/grid
// utilities call it on mount (e.g. useBreakpoint), so anything rendering an
// antd component needs this polyfilled or mount throws.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}
