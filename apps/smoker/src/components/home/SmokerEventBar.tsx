/**
 * The stamp bar: the touchscreen's whole share of the cook log.
 *
 * A row of buttons under the chart, each one a stamp the installation has
 * switched on, each printing the clock time it was last tapped at in this cook.
 * That time is the point of the bar — standing at the smoker the question is
 * never "was this ever done" but "how long ago did I do it", and the answer
 * belongs on the button that answers it rather than in a list somewhere else.
 *
 * The row scrolls sideways under a thumb rather than wrapping or squeezing:
 * buttons are a fixed 130 across so a glove has the same target every time and
 * so the seventh plainly runs past the edge of an 800-wide panel, which is what
 * makes the rest of them discoverable. There is no cap on how many the
 * catalogue may offer, because the row can carry any number of them.
 *
 * The bar holds no log of its own and posts nothing: it is handed the events
 * and one command, so what it prints is always what the backend last said —
 * here, on a phone, and on any browser open at the same time. A tap the backend
 * refused leaves nothing at all behind: there is no offline queue on the pit,
 * and no delete either, because a mis-tap is undone on a screen with a list and
 * a keyboard rather than by a gloved thumb reaching for a small ×.
 */
import { Box } from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import { CookEvent, CookStamp, enabledStamps } from '../../api';
import { toneColor } from '../../theme/stampTones';
import { useDesign } from '../../theme/useDesign';

/**
 * How long a tapped button says what happened to it before going back to being
 * a button. A second is long enough to be read by somebody looking up from a
 * smoker, and short enough that the next tap is never blocked by the last one's
 * news.
 */
export const FLASH_MS = 1000;

/** How wide every button is. A fixed target, so a glove learns where they are. */
const BUTTON_WIDTH = 130;

/** How tall a button is, and the strip of card its row occupies below it. */
const BUTTON_HEIGHT = 52;
const ROW_PADDING = 2;

/**
 * How much of the 800×480 panel the row takes, top to bottom.
 *
 * Stated here rather than left to the layout, because it is the number the home
 * screen's chart has to be drawn short enough to leave: there is no scrollbar at
 * a smoker to go looking for anything that falls off the bottom.
 */
export const STAMP_BAR_HEIGHT = BUTTON_HEIGHT + ROW_PADDING;

export interface SmokerEventBarProps {
  /**
   * The catalogue, in the order the buttons are laid out. Whole rather than
   * pre-filtered, so the bar decides one way what it offers.
   */
  stamps: readonly CookStamp[];
  /** This cook's log, as the API serves it — what the times are read off. */
  events: readonly CookEvent[];
  /** Whether a cook is running; a stray tap is worse than a missed one. */
  smoking: boolean;
  /** Logs one tap, resolving whether the backend stored it. */
  onRecord: (stampKey: string) => Promise<boolean>;
}

/** What a tapped button is saying right now. */
type Flash = { key: string; logged: boolean } | null;

/** The moment as a clock time in the reader's own zone. */
const asClock = (at: Date): string =>
  at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * When each stamp was last tapped in this cook.
 *
 * The newest tap wins, because that is the one the question is about: a stamp
 * tapped four times says when it was tapped last, not when it was tapped first.
 */
const lastTapped = (events: readonly CookEvent[]): Record<string, Date> => {
  const newest: Record<string, Date> = {};
  events.forEach(event => {
    const held = newest[event.stampKey];
    if (!held || event.at.getTime() > held.getTime()) {
      newest[event.stampKey] = event.at;
    }
  });
  return newest;
};

export function SmokerEventBar({
  stamps,
  events,
  smoking,
  onRecord,
}: SmokerEventBarProps): JSX.Element {
  const design = useDesign();
  const [flash, setFlash] = useState<Flash>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A flash outliving the screen it belongs to would set state on a row that is
  // gone; the timer is cleared with the row.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  const tap = async (stamp: CookStamp): Promise<void> => {
    const stored = await onRecord(stamp.key);
    setFlash({ key: stamp.key, logged: stored });
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  const taps = lastTapped(events);

  return (
    <Box
      data-testid="smoker-stamp-bar"
      sx={{
        display: 'flex',
        gap: '8px',
        // The row is scrolled with a thumb, so it snaps to whole buttons: a
        // half-button at the edge of a panel is a target nobody can hit.
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollSnapType: 'x mandatory',
        // No scrollbar: there is no pointer to drag one with, and the strip it
        // occupies is button.
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        paddingBottom: `${ROW_PADDING}px`,
        // Present but plainly out of use. The row stays where it is rather than
        // vanishing — one that disappeared would move every button under the
        // thumb reaching for it the moment the smoker is lit.
        opacity: smoking ? 1 : 0.4,
      }}
    >
      {enabledStamps(stamps).map(stamp => {
        const flashing = flash?.key === stamp.key ? flash : null;
        const tapped = taps[stamp.key];
        return (
          <Box
            key={stamp.key}
            component="button"
            type="button"
            disabled={!smoking}
            data-testid={`smoker-stamp-${stamp.key}`}
            onClick={() => void tap(stamp)}
            sx={{
              width: `${BUTTON_WIDTH}px`,
              // Never squeezed to fit: the row runs off the edge instead, which
              // is what says there is more of it.
              flex: `0 0 ${BUTTON_WIDTH}px`,
              scrollSnapAlign: 'start',
              height: `${BUTTON_HEIGHT}px`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              cursor: smoking ? 'pointer' : 'default',
              borderRadius: '10px',
              // A refused tap turns the button itself red for the moment it is
              // saying so: read from across a garage, the colour arrives before
              // the words do.
              border: `1px solid ${flashing && !flashing.logged ? design.danger : design.border}`,
              backgroundColor: design.surfaceAlt,
              color: flashing && !flashing.logged ? design.danger : design.text,
              font: 'inherit',
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '100%' }}>
              {/* Colour alone says nothing to anybody who cannot see it, so the
                  dot only reinforces the label beside it. */}
              <Box
                data-testid={`smoker-stamp-tone-${stamp.key}`}
                aria-hidden="true"
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  backgroundColor: toneColor(stamp.tone, design),
                }}
              />
              <Box
                component="span"
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {stamp.label}
              </Box>
            </Box>
            {/* The second line is the button's answer: when it was last tapped,
                or what just happened to it. */}
            <Box
              component="span"
              data-testid={`smoker-stamp-time-${stamp.key}`}
              sx={{
                fontSize: 13,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                color: flashing
                  ? flashing.logged
                    ? design.success
                    : design.danger
                  : design.textSecondary,
              }}
            >
              {flashing
                ? flashing.logged
                  ? 'Logged'
                  : 'Not logged'
                : tapped
                  ? asClock(tapped)
                  : '—'}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
