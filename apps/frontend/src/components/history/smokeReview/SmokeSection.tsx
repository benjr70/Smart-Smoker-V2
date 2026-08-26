import { Box } from '@mui/material';
import React, { useMemo } from 'react';
import { CookEvent, SmokeProfile, SmokeTimeline } from '../../../api/types';
import { TempData } from 'temperaturechart/src/tempChart';
import TemperatureChart from 'temperaturechart/src/TemperatureChart';
import { decimate, isReported } from 'temperaturechart/src/chartGeometry';
import { useChartPalette } from '../../../theme';
import { useChartEvents } from '../../common/chartEvents';
import { chartNamesOf } from '../../common/chartNames';
import { DetailSection } from '../../common/components/DetailSection';
import { FieldGrid } from '../../common/components/FieldGrid';
import { NoteBlock } from '../../common/components/NoteBlock';
import { formatCookDuration } from '../../common/timeFormat';

export interface SmokeSectionProps {
  smokeProfile: SmokeProfile;
  temps: TempData[];
  /** The derived timing, or null for a cook the backend could not be asked about. */
  timeline: SmokeTimeline | null;
  /**
   * What was done to the cook, drawn as marks along the chart. A cook logged
   * before there was anything to log with has none, which draws the cook alone.
   */
  events?: CookEvent[];
}

/**
 * A temperature on record as the grid writes one; nothing on record stays
 * nothing. The wire's zero is the hardware's no-reading sentinel, not a
 * temperature, and the grid shares the chart's rule for it — the same card
 * must not claim the cook aimed at 0°F where the chart rules no target line.
 */
const formatTemp = (temperature: number | null | undefined): string | null =>
  temperature !== null && temperature !== undefined && isReported(temperature)
    ? `${Math.round(temperature)}°F`
    : null;

/** The four probe slots the legend lists, in the order the chart draws them. */
const LEGEND_SLOTS = ['chamber', 'probe1', 'probe2', 'probe3'] as const;

/**
 * Section 2 of the history detail: the cook itself. The timeline's numbers in
 * the field grid — each an em-dash when the record holds none — the probes
 * named in the same colours the chart draws their lines in, the temperature
 * log with the snapshotted target ruled across it, and the smoke notes.
 */
/** No log, as one value, so that omitting it does not redraw the cook. */
const NO_EVENTS: CookEvent[] = [];

export function SmokeSection({
  smokeProfile,
  temps,
  timeline,
  events = NO_EVENTS,
}: SmokeSectionProps): JSX.Element {
  const chartColors = useChartPalette();
  // The log in the chart's own terms: a moment, a word and the colour this
  // scheme draws that stamp's tone in.
  const marks = useChartEvents(events);
  // A finished cook is every reading it ever took — twelve hours of them for a
  // brisket. It is thinned once, not on every render of the review.
  const cook = useMemo(() => decimate(temps), [temps]);

  const legend = LEGEND_SLOTS.map(slot => {
    const name =
      slot === 'chamber' ? smokeProfile.chamberName : smokeProfile[`${slot}Name` as const];
    const written = name?.trim();
    return {
      slot,
      // The chamber always exists, named or not; a meat probe nobody named was
      // a probe with nothing on it, and saying so is what makes the chart's
      // legend make sense years later.
      label: written || (slot === 'chamber' ? 'Chamber' : 'Not used'),
      used: slot === 'chamber' || Boolean(written),
    };
  });

  return (
    <DetailSection number="2" title="Smoke" testId="review-smoke-section">
      <FieldGrid
        fields={[
          { label: 'Cook Time', value: formatCookDuration(timeline?.durationMs ?? null) },
          { label: 'Target Temp', value: formatTemp(timeline?.targetTemp) },
          { label: 'Peak Chamber', value: formatTemp(timeline?.peakChamber) },
          { label: 'Peak Meat', value: formatTemp(timeline?.peakMeat) },
        ]}
      />
      <Box data-testid="probe-legend" sx={{ display: 'grid', gap: '4px' }}>
        {legend.map(row => (
          <Box
            key={row.slot}
            data-testid="probe-legend-row"
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            {/* The swatch is what carries the probe's colour — the same chart
                token the chart strokes that probe's line in, so a name and its
                line match in either scheme. The name itself stays in text
                colour: two of the light chart colours do not clear the
                contrast threshold for small text on a card. */}
            <Box
              component="span"
              aria-hidden="true"
              data-testid={`probe-legend-swatch-${row.slot}`}
              sx={theme => ({
                width: 10,
                height: 10,
                borderRadius: '3px',
                flexShrink: 0,
                backgroundColor: theme.design.chart[row.slot],
              })}
            />
            <Box
              component="span"
              data-testid={`review-smoke-${row.slot === 'chamber' ? 'chambername' : `${row.slot}name`}`}
              sx={theme => ({
                fontSize: '0.875rem',
                fontWeight: row.used ? 600 : 400,
                color: row.used ? theme.design.text : theme.design.textSecondary,
              })}
            >
              {row.label}
            </Box>
          </Box>
        ))}
      </Box>
      <TemperatureChart
        data={cook}
        names={chartNamesOf(smokeProfile)}
        colors={chartColors}
        target={timeline?.targetTemp ?? undefined}
        events={marks}
        aspect="compact"
        // The section's own legend above is the one legend this card gets: it
        // knows which probes were never named, which the chart's cannot.
        legend={false}
      />
      <NoteBlock label="Smoke Notes" note={smokeProfile.notes} />
    </DetailSection>
  );
}
