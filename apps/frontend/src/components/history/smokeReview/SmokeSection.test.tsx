/**
 * Section 2 of the history detail: the cook itself. The numbers that matter —
 * cook time, target, peaks — in the field grid, the probes named in their
 * chart colours, and the temperature log with the target line that was
 * actually in force.
 *
 * The chart is the real one: what is asserted about the target line is the
 * line a reader would see, not a prop handed to a stub.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CookEvent, SmokeProfile, SmokeTimeline, TempData } from '../../../api/types';
import { DesignSurface, appTheme } from '../../../theme';
import { SmokeSection } from './SmokeSection';

const profile = (fields: Partial<SmokeProfile> = {}): SmokeProfile => ({
  chamberName: 'Big Green Egg',
  probe1Name: 'Brisket Flat',
  probe2Name: '',
  probe3Name: '  ',
  notes: 'Held 225 all afternoon.',
  woodType: 'Hickory',
  ...fields,
});

const timeline = (fields: Partial<SmokeTimeline> = {}): SmokeTimeline => ({
  startedAt: new Date('2026-04-20T14:15:00.000Z'),
  finishedAt: new Date('2026-04-20T20:35:00.000Z'),
  durationMs: 6 * 60 * 60 * 1000 + 20 * 60 * 1000,
  peakChamber: 268,
  peakMeat: 201,
  targetTemp: 203,
  ...fields,
});

const reading = (minute: number): TempData => ({
  ChamberTemp: 225,
  MeatTemp: 150,
  Meat2Temp: 0,
  Meat3Temp: 0,
  date: new Date(2026, 3, 20, 12, minute),
});

const showSection = (overrides: { timeline?: SmokeTimeline | null } = {}) => {
  const shown = 'timeline' in overrides ? overrides.timeline : timeline();
  return render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <SmokeSection
          smokeProfile={profile()}
          temps={[reading(0), reading(15)]}
          timeline={shown ?? null}
        />
      </DesignSurface>
    </CssVarsProvider>
  );
};

const fieldNamed = (label: string): HTMLElement => {
  const field = screen
    .getAllByTestId('field-grid-field')
    .find(candidate => candidate.textContent?.includes(label));
  expect(field).toBeDefined();
  return field as HTMLElement;
};

describe('the smoke section', () => {
  it('shows the cook’s numbers from the derived timeline', () => {
    showSection();

    expect(fieldNamed('Cook Time')).toHaveTextContent('6h 20m');
    expect(fieldNamed('Target Temp')).toHaveTextContent('203°F');
    expect(fieldNamed('Peak Chamber')).toHaveTextContent('268°F');
    expect(fieldNamed('Peak Meat')).toHaveTextContent('201°F');
  });

  it('admits every number a legacy cook lacks as an em-dash', () => {
    showSection({ timeline: null });

    ['Cook Time', 'Target Temp', 'Peak Chamber', 'Peak Meat'].forEach(label => {
      expect(fieldNamed(label)).toHaveTextContent('—');
    });
  });

  /**
   * The wire's zero is the hardware's no-reading sentinel, not a temperature:
   * the chart already refuses to rule a target at it, and the grid must tell
   * the same story rather than claim the cook aimed at 0°F.
   */
  it('admits a zeroed timeline as unreported, the same as the chart does', () => {
    showSection({ timeline: timeline({ targetTemp: 0, peakChamber: 0, peakMeat: 0 }) });

    ['Target Temp', 'Peak Chamber', 'Peak Meat'].forEach(label => {
      expect(fieldNamed(label)).toHaveTextContent('—');
      expect(fieldNamed(label)).not.toHaveTextContent('0°F');
    });
  });

  it('draws the temperature log with the target line that was in force', () => {
    const { container } = showSection();

    expect(container.querySelector('line[data-target="snapshot"]')).not.toBeNull();
    expect(screen.getByText('TARGET 203°')).toBeInTheDocument();
  });

  it('draws no target line for a cook whose target was never snapshotted', () => {
    const { container } = showSection({ timeline: timeline({ targetTemp: null }) });

    expect(container.querySelector('line[data-target="snapshot"]')).toBeNull();
  });

  it('names each probe, and marks the ones that were never named as not used', () => {
    showSection();

    const legend = screen.getAllByTestId('probe-legend-row');
    expect(legend).toHaveLength(4);
    expect(legend[0]).toHaveTextContent('Big Green Egg');
    expect(legend[1]).toHaveTextContent('Brisket Flat');
    expect(legend[2]).toHaveTextContent('Not used');
    expect(legend[3]).toHaveTextContent('Not used');
  });

  /**
   * The section's legend is the only one: the chart's built-in legend would
   * label the same unnamed probe "Probe 2" directly below the row that says
   * "Not used", and list the named ones twice.
   */
  it('keeps the section legend as the only legend on the card', () => {
    const { container } = showSection();

    expect(container.querySelectorAll('[data-legend-swatch]')).toHaveLength(0);
    expect(screen.getAllByText('Brisket Flat')).toHaveLength(1);
  });

  it('keeps the smoke notes with the section', () => {
    showSection();

    expect(screen.getByTestId('note-block')).toHaveTextContent('Held 225 all afternoon.');
  });
});

/**
 * A past cook is explained by what was done to it, so the marks the pitmaster
 * left are drawn on the history chart in the same tone the log lists them in.
 */
describe('the marks on a past cook', () => {
  const logged: CookEvent = {
    _id: 'event-1',
    smokeId: 'smoke-7',
    stampKey: 'wood',
    label: 'Added Wood',
    tone: 'amber',
    at: new Date(2026, 3, 20, 12, 8),
    chamberTemp: 243,
    probe1Temp: 150,
    probe2Temp: null,
    probe3Temp: null,
  };

  const showWithLog = (events: CookEvent[]) =>
    render(
      <CssVarsProvider theme={appTheme} defaultMode="light">
        <DesignSurface>
          <SmokeSection
            smokeProfile={profile()}
            temps={[reading(0), reading(15)]}
            timeline={timeline()}
            events={events}
          />
        </DesignSurface>
      </CssVarsProvider>
    );

  it('draws a marker on the chart for every event of the cook', () => {
    const { container } = showWithLog([logged]);

    expect(container.querySelector('circle[data-event-marker="event-1"]')).toBeInTheDocument();
    expect(container.querySelector('text[data-event-letter="event-1"]')).toHaveTextContent('A');
  });

  it('draws none for a cook nothing was logged on', () => {
    const { container } = showWithLog([]);

    expect(container.querySelectorAll('circle[data-event-marker]')).toHaveLength(0);
  });
});
