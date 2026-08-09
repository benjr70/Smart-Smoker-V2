/**
 * The chart as a reader meets it: four lines in the colours they were given,
 * named in the legend, with the targets that were configured drawn across them
 * and a card under the finger.
 *
 * These render the real component — there is no d3 module to stub out any more,
 * because the drawing is React's and the arithmetic is `chartGeometry`'s.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import TemperatureChart, { ChartPalette, ChartSeriesNames } from './TemperatureChart';
import { ChartSample, formatClock } from './chartGeometry';

const colors: ChartPalette = {
  panel: '#FFFFFF',
  grid: '#E2E2DF',
  label: '#6B6B68',
  chamber: '#DA4A2E',
  probe1: '#3F7D46',
  probe2: '#2A6FB8',
  probe3: '#7C5AC8',
};

const names: ChartSeriesNames = {
  chamber: 'Chamber',
  probe1: 'Brisket Flat',
  probe2: 'Pork Butt',
  probe3: 'Ribs',
};

const at = (minute: number, readings: Partial<Omit<ChartSample, 'date'>> = {}): ChartSample => ({
  ChamberTemp: 225,
  MeatTemp: 140,
  Meat2Temp: 150,
  Meat3Temp: 160,
  date: new Date(2026, 0, 1, 12, minute),
  ...readings,
});

const cook: ChartSample[] = [
  at(0, { ChamberTemp: 200, MeatTemp: 100, Meat2Temp: 110, Meat3Temp: 120 }),
  at(15, { ChamberTemp: 260, MeatTemp: 120, Meat2Temp: 130, Meat3Temp: 140 }),
  at(30, { ChamberTemp: 230, MeatTemp: 140, Meat2Temp: 150, Meat3Temp: 160 }),
];

const seriesPaths = (container: HTMLElement): SVGPathElement[] =>
  Array.from(container.querySelectorAll<SVGPathElement>('path[data-series]'));

describe('the lines the chart draws', () => {
  it('draws one line per reading, each in the colour it was given', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);

    expect(seriesPaths(container).map(path => path.getAttribute('stroke'))).toEqual([
      colors.chamber,
      colors.probe1,
      colors.probe2,
      colors.probe3,
    ]);
  });

  /**
   * The chamber swings with the lid and is smoothed; a meat probe climbs, and a
   * curve through its readings would show an overshoot the meat never had.
   */
  it('smooths the chamber and leaves the probes straight', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);
    const [chamber, probe1] = seriesPaths(container).map(path => path.getAttribute('d') ?? '');

    expect(chamber).toContain('C');
    expect(probe1).not.toContain('C');
  });
});

describe('the frame around the cook', () => {
  it('rules a dashed gridline at every temperature it labels', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);

    const gridlines = Array.from(container.querySelectorAll('line[data-grid]'));
    const labels = Array.from(container.querySelectorAll('text[data-temp-label]'));

    expect(gridlines.length).toBeGreaterThan(1);
    expect(labels).toHaveLength(gridlines.length);
    gridlines.forEach(gridline => {
      expect(gridline).toHaveAttribute('stroke', colors.grid);
      expect(gridline.getAttribute('stroke-dasharray')).toBeTruthy();
    });
  });

  it('writes its axis labels in the label colour', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);

    const written = Array.from(
      container.querySelectorAll('text[data-temp-label], text[data-time-label]')
    );

    expect(written.length).toBeGreaterThan(2);
    written.forEach(label => expect(label).toHaveAttribute('fill', colors.label));
  });

  it('writes a time under the plot for each moment it rules off', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);

    expect(container.querySelectorAll('text[data-time-label]').length).toBeGreaterThan(1);
  });

  /** The dot is where the cook is right now, read off the chart itself. */
  it('marks the latest reading of each line with a dot in its colour', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);

    const dots = Array.from(container.querySelectorAll('circle[data-latest]'));

    expect(dots.map(dot => dot.getAttribute('fill'))).toEqual([
      colors.chamber,
      colors.probe1,
      colors.probe2,
      colors.probe3,
    ]);
  });

  it('leaves out the dot for a probe that never reported', () => {
    const oneProbe = cook.map(sample => ({ ...sample, Meat3Temp: 0 }));

    const { container } = render(
      <TemperatureChart data={oneProbe} names={names} colors={colors} />
    );

    expect(container.querySelectorAll('circle[data-latest]')).toHaveLength(3);
  });

  it('names each line in a legend under the plot', () => {
    render(<TemperatureChart data={cook} names={names} colors={colors} />);

    Object.values(names).forEach(name => expect(screen.getByText(name)).toBeInTheDocument());
  });

  it('marks each legend entry with the colour of its line', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);

    const swatches = Array.from(container.querySelectorAll('[data-legend-swatch]'));

    expect(swatches).toHaveLength(4);
    expect(swatches[0]).toHaveStyle({ backgroundColor: colors.chamber });
  });
});

/**
 * A target is the reason to look at the chart at all: how far the meat still has
 * to climb. They are drawn only for the probes that have one configured, in that
 * probe's own colour so the line and its target read as a pair.
 */
describe('target lines', () => {
  const targetLines = (container: HTMLElement): SVGLineElement[] =>
    Array.from(container.querySelectorAll<SVGLineElement>('line[data-target]'));

  it("draws a dashed line for each configured target, in its probe's colour", () => {
    const { container } = render(
      <TemperatureChart
        data={cook}
        names={names}
        colors={colors}
        targets={{ probe1: 203, probe3: 195 }}
      />
    );

    const drawn = targetLines(container);

    expect(drawn.map(line => line.getAttribute('stroke'))).toEqual([colors.probe1, colors.probe3]);
    drawn.forEach(line => expect(line.getAttribute('stroke-dasharray')).toBeTruthy());
  });

  it('writes the temperature each target line stands for', () => {
    render(
      <TemperatureChart data={cook} names={names} colors={colors} targets={{ probe1: 203 }} />
    );

    expect(screen.getByText('TARGET 203°')).toBeInTheDocument();
  });

  it('draws none when no targets are configured', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);

    expect(targetLines(container)).toHaveLength(0);
  });

  /**
   * A smoke starts with a target seeded for every probe, whether or not that
   * probe has meat on it. Only the probes actually reporting get a line.
   */
  it('draws nothing for a probe that has a target but no meat on it', () => {
    const oneProbe = cook.map(sample => ({ ...sample, Meat2Temp: 0, Meat3Temp: 0 }));

    const { container } = render(
      <TemperatureChart
        data={oneProbe}
        names={names}
        colors={colors}
        targets={{ probe1: 203, probe2: 165, probe3: 195 }}
      />
    );

    expect(targetLines(container).map(line => line.getAttribute('stroke'))).toEqual([
      colors.probe1,
    ]);
  });

  /**
   * The seeded target of an empty probe must not stretch the axis either, or the
   * cook that is really happening is squashed into a sliver of the plot.
   */
  it('leaves the axis to the cook when an empty probe has a high target', () => {
    const oneProbe = cook.map(sample => ({ ...sample, Meat2Temp: 0, Meat3Temp: 0 }));
    const labelled = (container: HTMLElement): number[] =>
      Array.from(container.querySelectorAll('text[data-temp-label]')).map(label =>
        Number(label.getAttribute('data-temp-label'))
      );

    const { container: seeded } = render(
      <TemperatureChart
        data={oneProbe}
        names={names}
        colors={colors}
        targets={{ probe2: 500, probe3: 500 }}
      />
    );
    const { container: bare } = render(
      <TemperatureChart data={oneProbe} names={names} colors={colors} />
    );

    expect(labelled(seeded)).toEqual(labelled(bare));
  });

  /** A target still to be climbed to has to be on the chart, not off the top of it. */
  it('keeps a target above the cook inside the plot', () => {
    const { container } = render(
      <TemperatureChart data={cook} names={names} colors={colors} targets={{ probe1: 400 }} />
    );

    const [line] = targetLines(container);

    expect(Number(line.getAttribute('y1'))).toBeGreaterThan(0);
    expect(Number(line.getAttribute('y1'))).toBeLessThan(200);
  });
});

/**
 * Reading the cook back: a finger on the plot picks out the nearest reading and
 * says what every probe was at that moment.
 */
describe('touching the plot', () => {
  /**
   * jsdom has no `PointerEvent`, so a touch is posted as the mouse event of the
   * same name: what matters is that a `pointermove` carrying an x lands on the
   * chart, which is exactly what a phone sends.
   */
  const touchAt = (container: HTMLElement, x: number): void => {
    fireEvent(
      container.querySelector('svg') as SVGSVGElement,
      new MouseEvent('pointermove', { bubbles: true, clientX: x })
    );
  };

  /** The plot spans the mobile box's margins, so this is the middle reading. */
  const middleOfThePlot = 193;

  it('shows nothing until the plot is touched', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);

    expect(container.querySelector('[data-hover-card]')).toBeNull();
  });

  const card = (container: HTMLElement): HTMLElement =>
    container.querySelector('[data-hover-card]') as unknown as HTMLElement;

  it('names the moment and every reading under the finger', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);

    touchAt(container, middleOfThePlot);
    const shown = within(card(container));

    expect(shown.getByText(formatClock(cook[1].date))).toBeInTheDocument();
    expect(shown.getByText('260°')).toBeInTheDocument();
    expect(shown.getByText('120°')).toBeInTheDocument();
    expect(shown.getByText('130°')).toBeInTheDocument();
    expect(shown.getByText('140°')).toBeInTheDocument();
    Object.values(names).forEach(name => expect(shown.getByText(name)).toBeInTheDocument());
  });

  it('marks that moment with a crosshair and a dot on each line', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);

    touchAt(container, middleOfThePlot);

    expect(container.querySelector('line[data-crosshair]')).toBeInTheDocument();
    expect(container.querySelectorAll('circle[data-hover]')).toHaveLength(4);
  });

  it('reads back the reading nearest the finger, not the one it started at', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);

    touchAt(container, 340);

    expect(within(card(container)).getByText(formatClock(cook[2].date))).toBeInTheDocument();
  });

  it('leaves out the dot for a probe that was not reporting at that moment', () => {
    const partial = cook.map(sample => ({ ...sample, Meat2Temp: 0 }));

    const { container } = render(<TemperatureChart data={partial} names={names} colors={colors} />);
    touchAt(container, middleOfThePlot);

    expect(container.querySelectorAll('circle[data-hover]')).toHaveLength(3);
  });

  /**
   * A live cook grows, and the caller thins it again as it does, so the same
   * moment lands at a different place in the array from one render to the next.
   * The finger has not moved, so neither should the reading it is resting on.
   */
  it('stays on the same moment when the cook is thinned again beneath it', () => {
    const { container, rerender } = render(
      <TemperatureChart data={cook} names={names} colors={colors} />
    );

    touchAt(container, middleOfThePlot);
    expect(within(card(container)).getByText(formatClock(cook[1].date))).toBeInTheDocument();

    const rethinned = [at(0), at(7), at(15), at(22), at(30)];
    rerender(<TemperatureChart data={rethinned} names={names} colors={colors} />);

    expect(within(card(container)).getByText(formatClock(cook[1].date))).toBeInTheDocument();
  });

  it('puts the card away when the finger leaves', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);
    const svg = container.querySelector('svg') as SVGSVGElement;

    touchAt(container, middleOfThePlot);
    fireEvent.pointerLeave(svg);

    expect(container.querySelector('[data-hover-card]')).toBeNull();
  });

  it('has nothing to show for an empty cook', () => {
    const { container } = render(<TemperatureChart data={[]} names={names} colors={colors} />);

    touchAt(container, middleOfThePlot);

    expect(container.querySelector('[data-hover-card]')).toBeNull();
  });
});

/**
 * A smoke that has been started but has no readings yet — the first seconds of a
 * cook, or the backend not reporting — is still on the screen, and it must not
 * date itself to the epoch while the reader waits.
 */
describe('a cook that has not started', () => {
  it('labels its time axis with the present rather than 1970', () => {
    const { container } = render(<TemperatureChart data={[]} names={names} colors={colors} />);

    const labelled = Array.from(container.querySelectorAll('text[data-time-label]')).map(label =>
      new Date(label.getAttribute('data-time-label') as string).getFullYear()
    );

    expect(labelled.length).toBeGreaterThan(0);
    labelled.forEach(year => expect(year).toBe(new Date().getFullYear()));
  });
});

/**
 * A stored cook comes back from the API in whatever order the database found
 * its rows in, and that order is newest-first. The chart is handed the cook and
 * draws it: it must draw the same cook whichever way round the rows arrived,
 * rather than an axis that runs backwards with the lines drawn off the side of
 * the plot.
 */
describe('a cook that arrived newest-first', () => {
  const backwards = [...cook].reverse();

  it('labels the time axis forwards, across the span of the cook', () => {
    const { container } = render(
      <TemperatureChart data={backwards} names={names} colors={colors} />
    );

    const labelled = Array.from(container.querySelectorAll('text[data-time-label]')).map(label =>
      new Date(label.getAttribute('data-time-label') as string).getTime()
    );

    expect(labelled.length).toBeGreaterThan(1);
    expect(labelled).toEqual([...labelled].sort((a, b) => a - b));
    expect(labelled[0]).toBeGreaterThanOrEqual(new Date(cook[0].date).getTime());
    expect(labelled[labelled.length - 1]).toBeLessThanOrEqual(new Date(cook[2].date).getTime());
  });

  it('draws the cook inside the plot, in the same places as it would forwards', () => {
    const { container: forwards } = render(
      <TemperatureChart data={cook} names={names} colors={colors} />
    );
    const { container: reversed } = render(
      <TemperatureChart data={backwards} names={names} colors={colors} />
    );

    const xs = (container: HTMLElement): number[] =>
      Array.from(container.querySelectorAll('circle[data-latest]')).map(dot =>
        Number(dot.getAttribute('cx'))
      );

    expect(xs(reversed)).toEqual(xs(forwards));
    xs(reversed).forEach(x => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(360);
    });
  });

  /** The dot marks where the cook has got to, not where the array happens to end. */
  it('marks the newest reading with the latest dot', () => {
    const pulled = [...cook]
      .reverse()
      .map((sample, index) => ({ ...sample, MeatTemp: 100 + index }));

    const { container } = render(<TemperatureChart data={pulled} names={names} colors={colors} />);

    const probe1 = container.querySelector('circle[data-latest="probe1"]') as SVGCircleElement;
    const chamber = container.querySelector('circle[data-latest="chamber"]') as SVGCircleElement;

    // The right-hand edge of the mobile plot, which is where the newest reading
    // sits — not the last row of an array that came back newest-first.
    const rightEdge = 348;
    expect(Number(probe1.getAttribute('cx'))).toBe(rightEdge);
    expect(Number(chamber.getAttribute('cx'))).toBe(rightEdge);
  });

  it('reads back the reading nearest the finger', () => {
    const { container } = render(
      <TemperatureChart data={backwards} names={names} colors={colors} />
    );

    fireEvent(
      container.querySelector('svg') as SVGSVGElement,
      new MouseEvent('pointermove', { bubbles: true, clientX: 193 })
    );

    expect(
      within(container.querySelector('[data-hover-card]') as unknown as HTMLElement).getByText(
        formatClock(cook[1].date)
      )
    ).toBeInTheDocument();
  });
});

describe('the shape the chart is drawn in', () => {
  it("draws in the phone's shape unless it is told otherwise", () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);

    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 360 200');
  });

  /** The kiosk hands the chart a taller panel than a phone does. */
  it('draws taller on the touchscreen and shorter on a history card', () => {
    const { container: kiosk } = render(
      <TemperatureChart data={cook} names={names} colors={colors} aspect="touchscreen" />
    );
    const { container: history } = render(
      <TemperatureChart data={cook} names={names} colors={colors} aspect="compact" />
    );

    expect(kiosk.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 430 340');
    expect(history.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 340 160');
  });

  /** Whatever shape it is drawn in, it fills the width its container gives it. */
  it('fills the width it is given rather than measuring itself', () => {
    const { container } = render(<TemperatureChart data={cook} names={names} colors={colors} />);

    expect(container.querySelector('svg')).toHaveAttribute('width', '100%');
  });
});

/**
 * A cook read back out of the API is dated with ISO strings rather than `Date`s,
 * and a smoke reviewed in History has to be drawn exactly as it was drawn live.
 */
describe('a cook dated with strings', () => {
  const asStrings = cook.map(sample => ({ ...sample, date: new Date(sample.date).toISOString() }));

  it('draws the same lines as the same cook dated with dates', () => {
    const { container: fromStrings } = render(
      <TemperatureChart data={asStrings} names={names} colors={colors} />
    );
    const { container: fromDates } = render(
      <TemperatureChart data={cook} names={names} colors={colors} />
    );

    expect(seriesPaths(fromStrings).map(path => path.getAttribute('d'))).toEqual(
      seriesPaths(fromDates).map(path => path.getAttribute('d'))
    );
  });

  it('reads back the same moment under the finger', () => {
    const { container } = render(
      <TemperatureChart data={asStrings} names={names} colors={colors} />
    );

    fireEvent(
      container.querySelector('svg') as SVGSVGElement,
      new MouseEvent('pointermove', { bubbles: true, clientX: 193 })
    );

    expect(
      within(container.querySelector('[data-hover-card]') as unknown as HTMLElement).getByText(
        formatClock(cook[1].date)
      )
    ).toBeInTheDocument();
  });
});
