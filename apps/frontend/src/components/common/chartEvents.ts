/**
 * The cook log as the temperature chart wants it.
 *
 * The chart knows nothing about stamps or tones — it is handed a moment, a word
 * and a colour, and draws them. Resolving a stamp's tone against the scheme in
 * effect is this app's business, and doing it in one place is what keeps a
 * marker on the live chart, a marker on a history chart and the dot beside the
 * same event in the log all the same colour.
 */
import { useMemo } from 'react';
import type { ChartEvent } from 'temperaturechart/src/eventMarkers';
import type { DesignPalette } from 'theme/src';
import { CookEvent } from '../../api/types';
import { useDesignPalette } from '../../theme';
import { toneColor } from './stampTones';

export const chartEventsOf = (events: CookEvent[], design: DesignPalette): ChartEvent[] =>
  events.map(event => ({
    id: event._id,
    label: event.label,
    at: event.at,
    color: toneColor(event.tone, design),
  }));

/**
 * The same, for a component drawing under whatever scheme is in effect.
 *
 * Held between renders, because the chart derives its whole drawing from the
 * list it is handed: rebuilding it on every render would redraw a twelve-hour
 * cook every time anything on the screen changed.
 */
export const useChartEvents = (events: CookEvent[]): ChartEvent[] => {
  const design = useDesignPalette();
  return useMemo(() => chartEventsOf(events, design), [events, design]);
};
