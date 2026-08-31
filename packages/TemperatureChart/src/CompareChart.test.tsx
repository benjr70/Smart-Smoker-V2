/**
 * The comparison as a reader meets it: two cooks' traces over one elapsed axis,
 * told apart by colour for the cook and by dash for the probe, with chips for
 * the positions there is something to draw and a key saying whose probe each
 * position is.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import React, { useState } from 'react';
import CompareChart, { CompareChartProps, CompareCookSeries, ComparePalette } from './CompareChart';
import { COMPARE_BOX, CompareReading, DEFAULT_POSITIONS } from './compareGeometry';
import { SeriesKey, plotEdges } from './chartGeometry';

const colors: ComparePalette = {
  panel: '#ECECEA',
  grid: '#E2E2DF',
  label: '#6B6B68',
  text: '#1A1A18',
};

const COLOR_A = '#2A6FB8';
const COLOR_B = '#DA4A2E';

const START = new Date('2026-08-31T10:00:00.000Z');
const at = (minutes: number): Date => new Date(START.getTime() + minutes * 60_000);

const reading = (minutes: number, over: Partial<CompareReading> = {}): CompareReading => ({
  date: at(minutes),
  chamber: null,
  probe1: null,
  probe2: null,
  probe3: null,
  ...over,
});

/** A cook of the given length, reporting on the positions it was given. */
const cook = (
  over: Partial<CompareCookSeries> & Pick<CompareCookSeries, 'color'>
): CompareCookSeries => ({
  pts: [
    reading(0, { chamber: 200, probe1: 90 }),
    reading(60, { chamber: 250, probe1: 150 }),
    reading(120, { chamber: 240, probe1: 203 }),
  ],
  mins: 120,
  stamps: [],
  probeNames: {},
  ...over,
});

const brisket = cook({
  color: COLOR_A,
  probeNames: { chamber: 'Chamber', probe1: 'Brisket Flat' },
});

const pork = cook({
  color: COLOR_B,
  mins: 240,
  pts: [
    reading(0, { chamber: 210, probe1: 80 }),
    reading(120, { chamber: 245, probe1: 160 }),
    reading(240, { chamber: 250, probe1: 198 }),
  ],
  probeNames: { chamber: 'Pit', probe1: 'Butt' },
});

/**
 * The chart as a screen drives it.
 *
 * Which positions are shown belongs to the caller, so these tests hold it the
 * way the compare screen does and press the chips against that.
 */
function Chart({
  initial = DEFAULT_POSITIONS,
  ...rest
}: Omit<CompareChartProps, 'positions' | 'onPositionsChange'> & {
  initial?: readonly SeriesKey[];
}): JSX.Element {
  const [positions, setPositions] = useState<readonly SeriesKey[]>(initial);
  return <CompareChart {...rest} positions={positions} onPositionsChange={setPositions} />;
}

const lineOf = (container: HTMLElement, cookId: 'a' | 'b', position: string): SVGPathElement => {
  const path = container.querySelector<SVGPathElement>(
    `path[data-cook="${cookId}"][data-position="${position}"]`
  );
  if (path === null) throw new Error(`no ${cookId} line for ${position}`);
  return path;
};

const drawnPositions = (container: HTMLElement, cookId: 'a' | 'b'): (string | null)[] =>
  Array.from(container.querySelectorAll<SVGPathElement>(`path[data-cook="${cookId}"]`)).map(path =>
    path.getAttribute('data-position')
  );

describe('the lines the comparison draws', () => {
  it('draws each cook in its own colour, on the positions both are showing', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);

    expect(lineOf(container, 'a', 'probe1').getAttribute('stroke')).toBe(COLOR_A);
    expect(lineOf(container, 'b', 'probe1').getAttribute('stroke')).toBe(COLOR_B);
    expect(lineOf(container, 'a', 'chamber').getAttribute('stroke')).toBe(COLOR_A);
  });

  it('opens on the chamber and the first probe, and nothing else', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);

    expect(drawnPositions(container, 'a')).toEqual(['chamber', 'probe1']);
  });
});

/** A pork butt that also ran a second probe, which the brisket never did. */
const porkWithSecondProbe = cook({
  ...pork,
  pts: [
    reading(0, { chamber: 210, probe1: 80, probe2: 75 }),
    reading(120, { chamber: 245, probe1: 160, probe2: 150 }),
    reading(240, { chamber: 250, probe1: 198, probe2: 190 }),
  ],
  probeNames: { chamber: 'Pit', probe1: 'Butt', probe2: 'Second Butt' },
});

/** A pork butt run with a third probe as well, which is the rarest of them. */
const porkWithThirdProbe = cook({
  ...pork,
  pts: [
    reading(0, { chamber: 210, probe1: 80, probe3: 70 }),
    reading(120, { chamber: 245, probe1: 160, probe3: 140 }),
    reading(240, { chamber: 250, probe1: 198, probe3: 185 }),
  ],
  probeNames: { chamber: 'Pit', probe1: 'Butt', probe3: 'Ribs' },
});

describe('the chips that choose what is drawn', () => {
  it('offers a position either cook ran, and only those', () => {
    render(<Chart a={brisket} b={porkWithSecondProbe} colors={colors} />);

    expect(screen.getByRole('button', { name: 'Chamber' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Probe 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Probe 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Probe 3' })).not.toBeInTheDocument();
  });

  it('opens with the chamber and the first probe pressed and the rest not', () => {
    render(<Chart a={brisket} b={porkWithSecondProbe} colors={colors} />);

    expect(screen.getByRole('button', { name: 'Chamber' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Probe 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Probe 2' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('draws a position when its chip is pressed, for the cooks that ran it', () => {
    const { container } = render(<Chart a={brisket} b={porkWithSecondProbe} colors={colors} />);

    fireEvent.click(screen.getByRole('button', { name: 'Probe 2' }));

    expect(drawnPositions(container, 'b')).toEqual(['chamber', 'probe1', 'probe2']);
    expect(drawnPositions(container, 'a')).toEqual(['chamber', 'probe1']);
  });

  it('stops drawing a position when its chip is pressed again', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);

    fireEvent.click(screen.getByRole('button', { name: 'Chamber' }));

    expect(drawnPositions(container, 'a')).toEqual(['probe1']);
  });
});

describe('how the probes are told apart', () => {
  const withSecondProbe = (): HTMLElement => {
    const { container } = render(<Chart a={brisket} b={porkWithSecondProbe} colors={colors} />);
    fireEvent.click(screen.getByRole('button', { name: 'Probe 2' }));
    return container;
  };

  it('rules the chamber thin and dashed, behind the probe it is cooking', () => {
    const chamber = lineOf(withSecondProbe(), 'a', 'chamber');

    expect(chamber.getAttribute('stroke-dasharray')).toBe('4,3');
    expect(chamber.getAttribute('stroke-width')).toBe('1.4');
    expect(chamber.getAttribute('opacity')).toBe('0.7');
  });

  it('draws the first probe solid, heaviest and at full strength', () => {
    const probe1 = lineOf(withSecondProbe(), 'a', 'probe1');

    expect(probe1.getAttribute('stroke-dasharray')).toBeNull();
    expect(probe1.getAttribute('stroke-width')).toBe('2.4');
    expect(probe1.getAttribute('opacity')).toBe('1');
  });

  it('gives the second probe its own dash, held behind the first', () => {
    const probe2 = lineOf(withSecondProbe(), 'b', 'probe2');

    expect(probe2.getAttribute('stroke-dasharray')).toBe('7,3');
    expect(probe2.getAttribute('stroke-width')).toBe('1.8');
    expect(probe2.getAttribute('opacity')).toBe('0.7');
  });

  it('gives the third probe the finest dash of all, held behind the first too', () => {
    const { container } = render(
      <Chart
        a={brisket}
        b={porkWithThirdProbe}
        colors={colors}
        initial={['chamber', 'probe1', 'probe3']}
      />
    );
    const probe3 = lineOf(container, 'b', 'probe3');

    expect(probe3.getAttribute('stroke-dasharray')).toBe('1.5,3');
    expect(probe3.getAttribute('stroke-width')).toBe('1.4');
    expect(probe3.getAttribute('opacity')).toBe('0.7');
  });
});

describe('where each cook ended', () => {
  const endOf = (container: HTMLElement, cookId: 'a' | 'b'): SVGLineElement => {
    const marker = container.querySelector<SVGLineElement>(`line[data-cook-end="${cookId}"]`);
    if (marker === null) throw new Error(`no end marker for ${cookId}`);
    return marker;
  };

  it('rules a faint dashed line in each cook’s colour where that cook ended', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);

    expect(endOf(container, 'a').getAttribute('stroke')).toBe(COLOR_A);
    expect(endOf(container, 'b').getAttribute('stroke')).toBe(COLOR_B);
    expect(endOf(container, 'a').getAttribute('stroke-dasharray')).toBe('3,3');
    expect(Number(endOf(container, 'a').getAttribute('opacity'))).toBeLessThan(1);
  });

  it('rules the shorter cook’s end short of the longer cook’s, which is the axis’ end', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);

    const shorter = Number(endOf(container, 'a').getAttribute('x1'));
    const longer = Number(endOf(container, 'b').getAttribute('x1'));

    expect(shorter).toBeLessThan(longer);
    expect(longer).toBeCloseTo(plotEdges(COMPARE_BOX).right);
  });

  /**
   * A cook with no derived timing and no datable readings has no length on
   * record; a marker at hour zero would claim it ended the moment it was lit.
   */
  it('rules no end for a cook whose length nothing recorded', () => {
    const { container } = render(
      <Chart a={cook({ color: COLOR_A, mins: 0 })} b={pork} colors={colors} />
    );

    expect(container.querySelector('line[data-cook-end="a"]')).toBeNull();
    expect(container.querySelector('line[data-cook-end="b"]')).not.toBeNull();
  });

  /**
   * The traces are placed on the start the caller measured the length from, so
   * a cook whose leading readings were clipped away still has its end marker
   * where its readings say the cook got to.
   */
  it('measures the traces from the start it is given, so the end marker lands with them', () => {
    const clipped = cook({
      color: COLOR_A,
      mins: 120,
      startedAt: START,
      pts: [
        reading(60, { chamber: 240, probe1: 150 }),
        reading(120, { chamber: 240, probe1: 203 }),
      ],
    });

    const { container } = render(<Chart a={clipped} b={pork} colors={colors} />);
    const path = lineOf(container, 'a', 'probe1').getAttribute('d') ?? '';
    const firstX = Number(path.replace(/^M/, '').split(',')[0]);
    const edges = plotEdges(COMPARE_BOX);

    // Half an hour into a four-hour axis, not at the left-hand edge.
    expect(firstX).toBeGreaterThan(edges.left);
    expect(firstX).toBeCloseTo(edges.left + (edges.right - edges.left) / 4);
  });
});

describe('the chart as its caller drives it', () => {
  it('shows the positions it is handed rather than a choice of its own', () => {
    const { container } = render(
      <Chart a={brisket} b={porkWithSecondProbe} colors={colors} initial={['probe1', 'probe2']} />
    );

    expect(drawnPositions(container, 'b')).toEqual(['probe1', 'probe2']);
    expect(screen.getByRole('button', { name: 'Chamber' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('tells the caller the new positions when a chip is pressed', () => {
    const onPositionsChange = jest.fn();
    render(
      <CompareChart
        a={brisket}
        b={porkWithSecondProbe}
        colors={colors}
        positions={['chamber', 'probe1']}
        onPositionsChange={onPositionsChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Probe 2' }));

    expect(onPositionsChange).toHaveBeenCalledWith(['chamber', 'probe1', 'probe2']);
  });

  it('ignores a position neither cook ran rather than drawing an empty line', () => {
    const { container } = render(
      <Chart a={brisket} b={pork} colors={colors} initial={['probe1', 'probe3']} />
    );

    expect(drawnPositions(container, 'a')).toEqual(['probe1']);
    expect(screen.queryByRole('button', { name: 'Probe 3' })).not.toBeInTheDocument();
  });

  /** The chips are the chart's only control, so they are thumb-sized. */
  it('offers each chip at the thumb target the screen is driven at', () => {
    render(<Chart a={brisket} b={pork} colors={colors} />);

    expect(screen.getByRole('button', { name: 'Chamber' })).toHaveStyle({ height: '44px' });
  });
});

describe('the temperature axis', () => {
  const axisLabels = (container: HTMLElement): (string | null)[] =>
    Array.from(container.querySelectorAll('svg text')).map(text => text.textContent);

  /**
   * Adding a probe must add a line, not move the axis: two glances at the same
   * plot have to be comparable.
   */
  it('stays where it is as positions are added and taken away', () => {
    const { container } = render(<Chart a={brisket} b={porkWithSecondProbe} colors={colors} />);
    const before = axisLabels(container);

    fireEvent.click(screen.getByRole('button', { name: 'Probe 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chamber' }));

    expect(axisLabels(container)).toEqual(before);
  });
});

describe('the key under the chips', () => {
  const rowOf = (container: HTMLElement, position: string): HTMLElement => {
    const row = container.querySelector<HTMLElement>(`[data-key-row="${position}"]`);
    if (row === null) throw new Error(`no key row for ${position}`);
    return row;
  };

  it('says whose probe each drawn position is, in each cook’s own words', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);
    const row = rowOf(container, 'probe1');

    expect(within(row).getByText('Probe 1')).toBeInTheDocument();
    expect(within(row).getByText('Brisket Flat')).toBeInTheDocument();
    expect(within(row).getByText('Butt')).toBeInTheDocument();
  });

  it('names each cook’s probe in that cook’s colour', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);
    const row = rowOf(container, 'probe1');

    expect(within(row).getByText('Brisket Flat')).toHaveStyle({ color: COLOR_A });
    expect(within(row).getByText('Butt')).toHaveStyle({ color: COLOR_B });
  });

  it('says a cook did not use a position rather than leaving its side blank', () => {
    const { container } = render(<Chart a={brisket} b={porkWithSecondProbe} colors={colors} />);
    fireEvent.click(screen.getByRole('button', { name: 'Probe 2' }));
    const row = rowOf(container, 'probe2');

    expect(within(row).getByText('not used')).toHaveStyle({ color: colors.label });
    expect(within(row).getByText('Second Butt')).toBeInTheDocument();
  });

  it('shows each position’s own dash beside it, so the key reads off the plot', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);
    const sample = rowOf(container, 'chamber').querySelector('line');

    expect(sample?.getAttribute('stroke-dasharray')).toBe('4,3');
    expect(sample?.getAttribute('stroke-width')).toBe('1.4');
  });

  it('keeps a row only for the positions being drawn', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);

    fireEvent.click(screen.getByRole('button', { name: 'Chamber' }));

    expect(container.querySelector('[data-key-row="chamber"]')).toBeNull();
    expect(container.querySelector('[data-key-row="probe1"]')).not.toBeNull();
  });
});

describe('a pair with nothing recorded', () => {
  const unrecorded = cook({ color: COLOR_A, pts: [], mins: 0 });

  it('offers no chips and no key, and still draws an axis to say so', () => {
    const { container } = render(
      <Chart a={unrecorded} b={cook({ color: COLOR_B, pts: [], mins: 0 })} colors={colors} />
    );

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelectorAll('[data-key-row]')).toHaveLength(0);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

describe('a cook log handed over before it is drawn', () => {
  it('takes each cook’s stamps without drawing them yet', () => {
    const stamped = cook({
      color: COLOR_A,
      stamps: [{ id: 's1', label: 'Wrapped', minutes: 70, color: '#3F7D46' }],
    });

    const { container } = render(<Chart a={stamped} b={pork} colors={colors} />);

    expect(screen.queryByText('Wrapped')).not.toBeInTheDocument();
    expect(container.querySelector('path[data-cook="a"][data-position="probe1"]')).not.toBeNull();
  });
});
