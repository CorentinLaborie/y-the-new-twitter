/*
 * Icons of the home feed boards that the shared icon set (components/brand/y-icon.tsx) does not have.
 * Paths are the design-system ones (design/canvas-build/project/ds/yds/components/bundle.js).
 */

const ICONS = {
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  'thumbs-up':
    '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
  'thumbs-down':
    '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  'triangle-alert':
    '<path fill="currentColor" stroke="none" d="M10.27 3.98a2 2 0 0 1 3.46 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.73-3z"/><path stroke="#fff" d="M12 9v4"/><path stroke="#fff" d="M12 17h.01"/>',
} as const;

type FeedIconName = keyof typeof ICONS;

export function FeedIcon({ name, size = 24 }: { name: FeedIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      // The paths are fixed strings from the design system, never user content.
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
