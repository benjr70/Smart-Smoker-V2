import React from 'react';

/**
 * The design's own icons, drawn as SVG rather than taken from the Material
 * icon set.
 *
 * The mock draws a single-weight outline family — a 24-unit box, a 2-unit
 * stroke, round caps and joins, nothing filled. Material's icons are solid
 * glyphs on a different grid, so the two cannot be mixed on one screen without
 * the difference being the first thing anyone notices. Each icon here takes its
 * colour from `currentColor` and its size from the one prop, so a caller states
 * the colour once, on the element around it.
 */
export interface DesignIconProps {
  /** Width and height, in pixels. */
  size?: number;
}

const OutlineIcon = ({
  size = 24,
  children,
}: DesignIconProps & { children: React.ReactNode }): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    // Hidden from assistive technology: every one of these sits beside, or
    // inside, something that already says in words what it means.
    aria-hidden="true"
    focusable="false"
    // The family, named: an icon is not reachable by role precisely because it
    // is hidden, so this is how something checks that what it is looking at is
    // one of the design's icons rather than a Material glyph.
    data-testid="design-icon"
  >
    {children}
  </svg>
);

/** The flame: the product's own mark, and the Smoke destination. */
export function FlameIcon({ size }: DesignIconProps = {}): JSX.Element {
  return (
    <OutlineIcon size={size}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </OutlineIcon>
  );
}

/** A clock turned back: past cooks, the History destination. */
export function HistoryIcon({ size }: DesignIconProps = {}): JSX.Element {
  return (
    <OutlineIcon size={size}>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </OutlineIcon>
  );
}

/** Rising bars: a lifetime of cooking added up, the Stats destination. */
export function StatsIcon({ size }: DesignIconProps = {}): JSX.Element {
  return (
    <OutlineIcon size={size}>
      <path d="M6 20V13" />
      <path d="M12 20V7" />
      <path d="M18 20v-5" />
      <path d="M3 20h18" />
    </OutlineIcon>
  );
}

/** The lens: the search field it sits in. */
export function SearchIcon({ size }: DesignIconProps = {}): JSX.Element {
  return (
    <OutlineIcon size={size}>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5L21 21" />
    </OutlineIcon>
  );
}

/** The bin: destroying what the control it sits on is about. */
export function TrashIcon({ size }: DesignIconProps = {}): JSX.Element {
  return (
    <OutlineIcon size={size}>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 12.1A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
      <path d="M10.5 11v5.5" />
      <path d="M13.5 11v5.5" />
    </OutlineIcon>
  );
}

/** The chevron back: out of a screen, to the one it was opened from. */
export function BackIcon({ size }: DesignIconProps = {}): JSX.Element {
  return (
    <OutlineIcon size={size}>
      <path d="M15 5l-7 7 7 7" />
    </OutlineIcon>
  );
}

/** Two arrows passing: exchanging one thing for the other. */
export function SwapIcon({ size }: DesignIconProps = {}): JSX.Element {
  return (
    <OutlineIcon size={size}>
      <path d="M7 8h11m0 0l-3-3m3 3l-3 3" />
      <path d="M17 16H6m0 0l3-3m-3 3l3 3" />
    </OutlineIcon>
  );
}

/** The gear: the Settings destination. */
export function SettingsIcon({ size }: DesignIconProps = {}): JSX.Element {
  return (
    <OutlineIcon size={size}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </OutlineIcon>
  );
}
