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
  surface: '#FFFFFF',
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

describe('a cook log as it was logged', () => {
  it('draws each stamp under the name and the tone it was stamped with', () => {
    const stamped = cook({
      color: COLOR_A,
      stamps: [{ id: 's1', label: 'Wrapped in foil', minutes: 70, color: '#3F7D46' }],
    });

    const { container } = render(<Chart a={stamped} b={pork} colors={colors} />);
    const stamp = screen.getByRole('button', { name: 'Wrapped in foil' });

    expect(stamp.querySelector('span')).toHaveStyle({ background: '#3F7D46' });
    expect(container.querySelector('path[data-cook="a"][data-position="probe1"]')).not.toBeNull();
  });

  it('draws an empty rail for a cook nothing was stamped on', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);
    const rail = container.querySelector('[data-stamp-rail="a"]');

    expect(rail).not.toBeNull();
    expect(rail?.querySelectorAll('button')).toHaveLength(0);
  });
});

/** The x of a minute of the cooks, in the chart's own coordinates. */
const xOfMinute = (minutes: number, span: number): number => {
  const edges = plotEdges(COMPARE_BOX);
  return edges.left + ((edges.right - edges.left) * minutes) / span;
};

const plotOf = (container: HTMLElement): SVGSVGElement => {
  const svg = container.querySelector<SVGSVGElement>('svg[data-testid="compare-plot"]');
  if (svg === null) throw new Error('no plot');
  return svg;
};

describe('scrubbing the plot', () => {
  it('rules a guide down the plot where the pointer is', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);

    fireEvent.mouseMove(plotOf(container), { clientX: xOfMinute(120, 240) });

    const guide = container.querySelector('line[data-scrub-guide]');
    expect(Number(guide?.getAttribute('x1'))).toBeCloseTo(xOfMinute(120, 240));
  });

  it('rules no guide until the plot is touched, and none once it is let go', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);
    expect(container.querySelector('line[data-scrub-guide]')).toBeNull();

    fireEvent.mouseMove(plotOf(container), { clientX: xOfMinute(60, 240) });
    expect(container.querySelector('line[data-scrub-guide]')).not.toBeNull();

    fireEvent.mouseLeave(plotOf(container));
    expect(container.querySelector('line[data-scrub-guide]')).toBeNull();
  });

  it('scrubs under a finger as well as a pointer', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);

    fireEvent.touchStart(plotOf(container), {
      touches: [{ clientX: xOfMinute(60, 240), clientY: 0 }],
    });

    expect(container.querySelector('line[data-scrub-guide]')).not.toBeNull();

    fireEvent.touchEnd(plotOf(container), { touches: [] });

    expect(container.querySelector('line[data-scrub-guide]')).toBeNull();
  });

  /**
   * A finger dragged across the plot moves the guide with it. That the page
   * does not scroll out from under that drag is `touch-action: none` on the
   * plot, which is CSS jsdom drops rather than behaviour a test can drive.
   */
  it('follows a finger as it drags across the plot', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);
    const plot = plotOf(container);

    fireEvent.touchStart(plot, { touches: [{ clientX: xOfMinute(60, 240), clientY: 0 }] });
    fireEvent.touchMove(plot, { touches: [{ clientX: xOfMinute(180, 240), clientY: 0 }] });

    const guide = container.querySelector('line[data-scrub-guide]');
    expect(Number(guide?.getAttribute('x1'))).toBeCloseTo(xOfMinute(180, 240));
  });
});

describe('the dots a scrub puts on the lines', () => {
  const dotOf = (container: HTMLElement, key: string): SVGCircleElement | null =>
    container.querySelector<SVGCircleElement>(`circle[data-scrub-dot="${key}"]`);

  it('marks each drawn line of each cook at the scrubbed minute', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);

    fireEvent.mouseMove(plotOf(container), { clientX: xOfMinute(60, 240) });

    expect(dotOf(container, 'a-probe1')?.getAttribute('fill')).toBe(COLOR_A);
    expect(dotOf(container, 'b-chamber')?.getAttribute('fill')).toBe(COLOR_B);
  });

  it('puts the dot on the nearest sample that cook actually took', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);

    fireEvent.mouseMove(plotOf(container), { clientX: xOfMinute(55, 240) });

    // The brisket reported at hour one; the dot sits on that reading, not on
    // the minute the finger is at.
    expect(Number(dotOf(container, 'a-probe1')?.getAttribute('cx'))).toBeCloseTo(
      xOfMinute(60, 240)
    );
  });

  it('marks nothing on a cook that had already finished', () => {
    const { container } = render(<Chart a={brisket} b={pork} colors={colors} />);

    fireEvent.mouseMove(plotOf(container), { clientX: xOfMinute(200, 240) });

    expect(dotOf(container, 'a-probe1')).toBeNull();
    expect(dotOf(container, 'b-probe1')).not.toBeNull();
  });
});

describe('the footer under the chart', () => {
  const footerOf = (container: HTMLElement): HTMLElement => {
    const footer = container.querySelector<HTMLElement>('[data-testid="compare-footer"]');
    if (footer === null) throw new Error('no footer');
    return footer;
  };

  const named = {
    a: cook({ ...brisket, name: 'Sunday brisket' }),
    b: cook({ ...pork, name: 'Pork butt' }),
  };

  it('names both cooks, how long they ran and how to read the chart', () => {
    const { container } = render(<Chart a={named.a} b={named.b} colors={colors} />);
    const footer = footerOf(container);

    expect(within(footer).getByText('Sunday brisket')).toBeInTheDocument();
    expect(within(footer).getByText('2h 00m')).toBeInTheDocument();
    expect(within(footer).getByText('Pork butt')).toBeInTheDocument();
    expect(within(footer).getByText('4h 00m')).toBeInTheDocument();
    expect(within(footer).getByText(/Drag to scrub/)).toBeInTheDocument();
  });

  it('reads out the scrubbed minute and both cooks’ temperatures there', () => {
    const { container } = render(<Chart a={named.a} b={named.b} colors={colors} />);

    fireEvent.mouseMove(plotOf(container), { clientX: xOfMinute(60, 240) });
    const footer = footerOf(container);

    expect(within(footer).getByText('1h 00m in')).toBeInTheDocument();
    expect(within(footer).getByText('250° / 150°')).toBeInTheDocument();
    expect(within(footer).queryByText(/Drag to scrub/)).not.toBeInTheDocument();
  });

  it('says a cook was finished rather than reading temperatures it never took', () => {
    const { container } = render(<Chart a={named.a} b={named.b} colors={colors} />);

    fireEvent.mouseMove(plotOf(container), { clientX: xOfMinute(200, 240) });
    const footer = footerOf(container);

    expect(within(footer).getByText('finished')).toBeInTheDocument();
  });

  it('goes back to naming the cooks once the scrub is let go', () => {
    const { container } = render(<Chart a={named.a} b={named.b} colors={colors} />);

    fireEvent.mouseMove(plotOf(container), { clientX: xOfMinute(60, 240) });
    fireEvent.mouseLeave(plotOf(container));

    expect(within(footerOf(container)).getByText(/Drag to scrub/)).toBeInTheDocument();
  });
});

const WRAPPED = { id: 's1', label: 'Wrapped', minutes: 60, color: '#3F7D46' };
const PULLED = { id: 's2', label: 'Pulled', minutes: 120, color: '#B4453A' };

const stampedBrisket = cook({ ...brisket, name: 'Sunday brisket', stamps: [WRAPPED, PULLED] });
const stampedPork = cook({
  ...pork,
  name: 'Pork butt',
  stamps: [{ id: 's3', label: 'Spritzed', minutes: 30, color: '#2F6F8F' }],
});

const railOf = (container: HTMLElement, cookId: 'a' | 'b'): HTMLElement => {
  const rail = container.querySelector<HTMLElement>(`[data-stamp-rail="${cookId}"]`);
  if (rail === null) throw new Error(`no rail for ${cookId}`);
  return rail;
};

const trackOf = (container: HTMLElement, cookId: 'a' | 'b'): HTMLElement => {
  const track = railOf(container, cookId).querySelector<HTMLElement>('[data-rail-track]');
  if (track === null) throw new Error(`no track for ${cookId}`);
  return track;
};

describe('the stamp rails under the plot', () => {
  it('gives each cook a rail of its own, lettered in that cook’s colour', () => {
    const { container } = render(<Chart a={stampedBrisket} b={stampedPork} colors={colors} />);

    expect(within(railOf(container, 'a')).getByText('A')).toHaveStyle({ color: COLOR_A });
    expect(within(railOf(container, 'b')).getByText('B')).toHaveStyle({ color: COLOR_B });
  });

  /** The rail claims to share the plot's x scale; the inset is that claim. */
  it('insets each rail’s track by exactly the plot’s own horizontal padding', () => {
    const { container } = render(<Chart a={stampedBrisket} b={stampedPork} colors={colors} />);
    const track = trackOf(container, 'a');

    expect(track).toHaveStyle({
      left: `${(COMPARE_BOX.margin.left / COMPARE_BOX.width) * 100}%`,
      right: `${(COMPARE_BOX.margin.right / COMPARE_BOX.width) * 100}%`,
    });
  });

  /** The letter is in the left gutter, so it cannot push the track off the plot. */
  it('writes the cook’s letter outside the track rather than in front of it', () => {
    const { container } = render(<Chart a={stampedBrisket} b={stampedPork} colors={colors} />);

    expect(within(railOf(container, 'a')).getByText('A')).toHaveStyle({ position: 'absolute' });
    expect(trackOf(container, 'a')).toHaveStyle({ position: 'absolute' });
  });

  it('stops each rail’s baseline where that cook stopped cooking', () => {
    const { container } = render(<Chart a={stampedBrisket} b={stampedPork} colors={colors} />);
    const baseline = (cookId: 'a' | 'b'): string | undefined =>
      trackOf(container, cookId).querySelector<HTMLElement>('[data-rail-baseline]')?.style.width;

    expect(baseline('a')).toBe('50%');
    expect(baseline('b')).toBe('100%');
  });

  it('puts each stamp where the plot puts that minute', () => {
    const { container } = render(<Chart a={stampedBrisket} b={stampedPork} colors={colors} />);
    const wrapped = within(railOf(container, 'a')).getByRole('button', { name: 'Wrapped' });

    expect(wrapped).toHaveStyle({ left: '25%' });
  });

  it('gives every stamp a thumb-sized target coloured by the tone it was logged with', () => {
    const { container } = render(<Chart a={stampedBrisket} b={stampedPork} colors={colors} />);
    const wrapped = within(railOf(container, 'a')).getByRole('button', { name: 'Wrapped' });

    expect(wrapped).toHaveStyle({ width: '30px', height: '30px' });
    expect(wrapped.querySelector('span')).toHaveStyle({ background: WRAPPED.color });
  });

  it('swells the stamp the scrub is over, and leaves the others alone', () => {
    const { container } = render(<Chart a={stampedBrisket} b={stampedPork} colors={colors} />);
    const dotOf = (name: string): HTMLElement | null =>
      within(railOf(container, 'a')).getByRole('button', { name }).querySelector('span');
    const restingSize = dotOf('Wrapped')?.style.width;

    fireEvent.mouseMove(plotOf(container), { clientX: xOfMinute(61, 240) });

    expect(dotOf('Wrapped')?.style.width).not.toBe(restingSize);
    expect(dotOf('Pulled')?.style.width).toBe(restingSize);
  });
});

describe('picking a stamp', () => {
  const footer = (container: HTMLElement): HTMLElement => {
    const found = container.querySelector<HTMLElement>('[data-testid="compare-footer"]');
    if (found === null) throw new Error('no footer');
    return found;
  };

  const pick = (container: HTMLElement, cookId: 'a' | 'b', name: string): void => {
    fireEvent.click(within(railOf(container, cookId)).getByRole('button', { name }));
  };

  it('names the stamp, whose cook it is and how far into that cook it was', () => {
    const { container } = render(<Chart a={stampedBrisket} b={stampedPork} colors={colors} />);

    pick(container, 'a', 'Wrapped');

    expect(within(footer(container)).getByText('Wrapped')).toBeInTheDocument();
    expect(within(footer(container)).getByText('Cook A · 1h 00m in')).toBeInTheDocument();
  });

  it('drops a dashed guide onto the plot in the stamp’s own colour', () => {
    const { container } = render(<Chart a={stampedBrisket} b={stampedPork} colors={colors} />);

    pick(container, 'b', 'Spritzed');
    const guide = container.querySelector('line[data-stamp-guide]');

    expect(guide?.getAttribute('stroke')).toBe('#2F6F8F');
    expect(guide?.getAttribute('stroke-dasharray')).toBe('3,3');
    expect(Number(guide?.getAttribute('x1'))).toBeCloseTo(xOfMinute(30, 240));
  });

  it('clears the pick when the same stamp is tapped again', () => {
    const { container } = render(<Chart a={stampedBrisket} b={stampedPork} colors={colors} />);

    pick(container, 'a', 'Wrapped');
    pick(container, 'a', 'Wrapped');

    expect(container.querySelector('line[data-stamp-guide]')).toBeNull();
    expect(within(footer(container)).getByText(/Drag to scrub/)).toBeInTheDocument();
  });

  it('clears the pick when the detail is dismissed', () => {
    const { container } = render(<Chart a={stampedBrisket} b={stampedPork} colors={colors} />);

    pick(container, 'a', 'Wrapped');
    fireEvent.click(screen.getByRole('button', { name: 'Clear stamp' }));

    expect(container.querySelector('line[data-stamp-guide]')).toBeNull();
    expect(within(footer(container)).getByText(/Drag to scrub/)).toBeInTheDocument();
  });

  it('moves the pick straight to another stamp rather than needing a clear first', () => {
    const { container } = render(<Chart a={stampedBrisket} b={stampedPork} colors={colors} />);

    pick(container, 'a', 'Wrapped');
    pick(container, 'b', 'Spritzed');

    expect(within(footer(container)).getByText('Cook B · 0h 30m in')).toBeInTheDocument();
  });

  /** The reader asked about a stamp; a scrub passing by does not un-ask it. */
  it('keeps the picked stamp in the footer while the plot is scrubbed', () => {
    const { container } = render(<Chart a={stampedBrisket} b={stampedPork} colors={colors} />);

    pick(container, 'a', 'Wrapped');
    fireEvent.mouseMove(plotOf(container), { clientX: xOfMinute(200, 240) });

    expect(within(footer(container)).getByText('Wrapped')).toBeInTheDocument();
    expect(within(footer(container)).queryByText('3h 20m in')).not.toBeInTheDocument();
    // The scrub itself still reads the plot underneath.
    expect(container.querySelector('line[data-scrub-guide]')).not.toBeNull();
  });
});
