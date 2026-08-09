/**
 * The chart's geometry, tested away from the browser.
 *
 * Everything the chart works out about where a thing goes lives in this module,
 * so this is where the awkward cooks are pinned down: the one that never moves,
 * the one that is a single reading long, the one with a target far above
 * anything the meat has reached yet, and the one with a probe that was never
 * plugged in.
 */
import {
  ChartAspect,
  ChartSample,
  DEFAULT_MAX_POINTS,
  LABEL_SIZE,
  LONE_READING_SPAN,
  axisLabelAnchors,
  cardLayout,
  cardPlacement,
  createScales,
  decimate,
  formatClock,
  formatTemperature,
  latestPointOf,
  momentAt,
  nearestIndex,
  plotBoxOf,
  plotEdges,
  pointOf,
  reportedTargets,
  seriesPath,
  targetLabelAnchor,
  tempTicks,
  tempYDomain,
  timeDomainOf,
  timeOf,
  timeTicks,
} from './chartGeometry';

const at = (minute: number, readings: Partial<Omit<ChartSample, 'date'>> = {}): ChartSample => ({
  ChamberTemp: 225,
  MeatTemp: 140,
  Meat2Temp: 150,
  Meat3Temp: 160,
  date: new Date(2026, 0, 1, 12, minute),
  ...readings,
});

describe('the y domain', () => {
  it('spans every reading, padded and rounded outward to 25s', () => {
    const cook = [at(0, { ChamberTemp: 212, MeatTemp: 68 }), at(1, { ChamberTemp: 249 })];

    expect(tempYDomain(cook)).toEqual([50, 275]);
  });

  /**
   * A cook that has not moved yet still needs an axis with room in it, or the
   * flat line would be drawn on top of both edges of the plot.
   */
  it('gives a cook that has not moved a band around it', () => {
    const flat = [0, 1, 2].map(minute =>
      at(minute, { ChamberTemp: 225, MeatTemp: 225, Meat2Temp: 225, Meat3Temp: 225 })
    );

    expect(tempYDomain(flat)).toEqual([200, 250]);
  });

  it('gives a single reading a band of its own', () => {
    expect(
      tempYDomain([at(0, { ChamberTemp: 100, MeatTemp: 100, Meat2Temp: 100, Meat3Temp: 100 })])
    ).toEqual([75, 125]);
  });

  /**
   * The whole point of drawing a target is to show how far the meat still has to
   * climb, so the axis has to reach it even before the meat does.
   */
  it('reaches a target that sits above everything recorded so far', () => {
    const cook = [at(0, { ChamberTemp: 150, MeatTemp: 80, Meat2Temp: 80, Meat3Temp: 80 })];

    expect(tempYDomain(cook, { probe1: 203 })).toEqual([50, 225]);
  });

  /**
   * A probe that is not plugged in reads zero. Letting that into the domain
   * would drag the axis down to freezing on every cook run with fewer than four
   * probes, and flatten the readings that are real.
   */
  it('ignores a probe that is not reporting', () => {
    const cook = [
      at(0, { ChamberTemp: 200, MeatTemp: 120, Meat2Temp: 0, Meat3Temp: 0 }),
      at(1, { ChamberTemp: 230, MeatTemp: 130, Meat2Temp: 0, Meat3Temp: 0 }),
    ];

    expect(tempYDomain(cook)).toEqual([100, 250]);
  });

  it('falls back to a plain range when nothing has been recorded', () => {
    expect(tempYDomain([])).toEqual([0, 100]);
  });
});

/**
 * A twelve-hour cook at the source cadence is tens of thousands of readings, and
 * drawing every one of them is what would make the chart crawl by the time the
 * bark sets. Decimation is what the caller reaches for before handing the array
 * over, so it has to be honest about the shape of the cook it throws away
 * detail from.
 */
describe('decimation', () => {
  const climbing = (count: number): ChartSample[] =>
    Array.from({ length: count }, (_, step) =>
      at(step, {
        ChamberTemp: 200 + step,
        MeatTemp: 100 + step,
        Meat2Temp: 110 + step,
        Meat3Temp: 120 + step,
      })
    );

  it('reduces a long cook to the number of points asked for', () => {
    expect(decimate(climbing(1000), 100)).toHaveLength(100);
  });

  it('averages the readings that fall in each bucket', () => {
    const [first] = decimate(climbing(10), 5);

    expect(first).toMatchObject({
      ChamberTemp: 200.5,
      MeatTemp: 100.5,
      Meat2Temp: 110.5,
      Meat3Temp: 120.5,
    });
  });

  it('places each averaged point at the middle of the moments it covers', () => {
    const cook = climbing(10);
    const [first] = decimate(cook, 5);

    expect(timeOf(first)).toBe((timeOf(cook[0]) + timeOf(cook[1])) / 2);
  });

  it('keeps the ends of the cook, so the axis still spans it', () => {
    const cook = climbing(600);
    const thinned = decimate(cook, 300);

    expect(thinned[0].ChamberTemp).toBeCloseTo(200.5);
    expect(thinned[thinned.length - 1].ChamberTemp).toBeCloseTo(798.5);
  });

  /**
   * A bucket can straddle the moment a probe was plugged in, and the zeros it
   * read before that are not cold meat — they are no reading at all. Averaging
   * them in would invent a temperature the meat never had and drag the axis
   * down to meet it.
   */
  it('averages only the readings a probe actually took', () => {
    const pluggedInPartway = [0, 0, 0, 120, 130].map((reading, step) =>
      at(step, { MeatTemp: reading })
    );

    expect(decimate(pluggedInPartway, 1)[0].MeatTemp).toBe(125);
  });

  /**
   * A probe that was unplugged for a whole bucket has to come out of decimation
   * still unplugged, so the gap in its line survives being thinned rather than
   * being papered over with an average of nothing.
   */
  it('keeps a gap a probe left, rather than averaging its way across it', () => {
    const unpluggedPartway = [130, 135, 0, 0].map((reading, step) =>
      at(step, { MeatTemp: reading })
    );

    const thinned = decimate(unpluggedPartway, 2);

    expect(thinned[0].MeatTemp).toBe(132.5);
    expect(thinned[1].MeatTemp).toBe(0);
    expect(seriesPath(thinned, 'probe1', createScales(thinned, plotBoxOf('mobile')))).not.toContain(
      'NaN'
    );
  });

  it('leaves a cook short enough to draw exactly as it is', () => {
    const cook = climbing(50);

    expect(decimate(cook, 300)).toBe(cook);
  });

  /**
   * Thinning buckets the readings by where they sit in the array, so a series
   * that arrived newest-first — or a stored cook with live readings appended
   * after it — would otherwise be averaged across moments hours apart, inventing
   * temperatures the smoker never held. The cook is put back in the order it was
   * cooked before any of it is averaged.
   */
  it('puts a cook that arrived newest-first back in order', () => {
    const backwards = [...climbing(10)].reverse();

    expect(decimate(backwards, 300).map(timeOf)).toEqual(climbing(10).map(timeOf));
  });

  it('averages a jumbled cook over the moments it really covers', () => {
    const jumbled = [climbing(4)[2], climbing(4)[0], climbing(4)[3], climbing(4)[1]];

    const thinned = decimate(jumbled, 2);

    expect(thinned.map(timeOf)).toEqual([
      (timeOf(climbing(4)[0]) + timeOf(climbing(4)[1])) / 2,
      (timeOf(climbing(4)[2]) + timeOf(climbing(4)[3])) / 2,
    ]);
    expect(thinned[0].ChamberTemp).toBe(200.5);
  });

  it('thins to a sane number of points when not told one', () => {
    expect(decimate(climbing(5000))).toHaveLength(DEFAULT_MAX_POINTS);
  });
});

/**
 * Which targets belong on the chart at all.
 *
 * Every smoke starts with a target seeded for all three probes, so a cook run
 * with one probe would otherwise be ruled across by two dashed lines for meat
 * that is not in the smoker — and, worse, have the axis stretched to reach them,
 * squashing the one real trace into a sliver.
 */
describe('the targets worth drawing', () => {
  it('keeps the target of a probe that is reporting', () => {
    const cook = [at(0, { MeatTemp: 120 }), at(1, { MeatTemp: 130 })];

    expect(reportedTargets(cook, { probe1: 203 })).toEqual({ probe1: 203 });
  });

  it('drops the target of a probe that never reported', () => {
    const oneProbe = [
      at(0, { MeatTemp: 120, Meat2Temp: 0, Meat3Temp: 0 }),
      at(1, { MeatTemp: 130, Meat2Temp: 0, Meat3Temp: 0 }),
    ];

    expect(reportedTargets(oneProbe, { probe1: 203, probe2: 165, probe3: 195 })).toEqual({
      probe1: 203,
    });
  });

  /** A probe pulled out mid-cook was still cooked, so its target still means something. */
  it('keeps the target of a probe that reported and then stopped', () => {
    const pulled = [at(0, { Meat2Temp: 150 }), at(1, { Meat2Temp: 0 })];

    expect(reportedTargets(pulled, { probe2: 165 })).toEqual({ probe2: 165 });
  });

  it('drops a target that was never really set', () => {
    const cook = [at(0), at(1)];

    expect(reportedTargets(cook, { probe1: 0, probe2: Number.NaN })).toEqual({});
  });

  it('has nothing to draw before the first reading arrives', () => {
    expect(reportedTargets([], { probe1: 203 })).toEqual({});
  });
});

/**
 * What the tooltip answers: a finger lands somewhere along the plot, and the
 * chart has to say which reading that is nearest to — including when the finger
 * lands past either end of the cook.
 */
describe('the nearest sample to a moment', () => {
  const cook = [at(0), at(10), at(20)];

  it('finds the reading a moment falls closest to', () => {
    expect(nearestIndex(cook, timeOf(at(11)))).toBe(1);
    expect(nearestIndex(cook, timeOf(at(16)))).toBe(2);
  });

  it('holds at the first reading for a moment before the cook started', () => {
    expect(nearestIndex(cook, timeOf(at(-30)))).toBe(0);
  });

  it('holds at the last reading for a moment past the end of the cook', () => {
    expect(nearestIndex(cook, timeOf(at(45)))).toBe(2);
  });

  it('picks the earlier reading for a moment exactly between two', () => {
    expect(nearestIndex(cook, timeOf(at(5)))).toBe(0);
  });

  it('has nothing to point at in an empty cook', () => {
    expect(nearestIndex([], timeOf(at(0)))).toBe(-1);
  });

  /**
   * A pointer event can arrive without a position — a stray one, or one from a
   * browser that has not laid the chart out yet — and no reading is nearest to
   * nowhere.
   */
  it('has nothing to point at for a moment it cannot read', () => {
    expect(nearestIndex(cook, Number.NaN)).toBe(-1);
  });
});

/**
 * The plot's own arithmetic: where a moment and a temperature land inside the
 * box the chart is given, and what the four lines through those points look like.
 */
describe('the plot', () => {
  const box = { width: 360, height: 200, margin: { top: 10, right: 10, bottom: 20, left: 40 } };
  const cook = [
    at(0, { ChamberTemp: 200, MeatTemp: 100, Meat2Temp: 110, Meat3Temp: 120 }),
    at(30, { ChamberTemp: 250, MeatTemp: 140, Meat2Temp: 150, Meat3Temp: 160 }),
  ];

  it('spans the cook from the left edge of the plot to the right', () => {
    const scales = createScales(cook, box);

    expect(scales.x(timeOf(cook[0]))).toBe(40);
    expect(scales.x(timeOf(cook[1]))).toBe(350);
  });

  it('puts the top of the temperature axis at the top of the plot', () => {
    const scales = createScales(cook, box);
    const [low, high] = tempYDomain(cook);

    expect(scales.y(high)).toBe(10);
    expect(scales.y(low)).toBe(180);
  });

  /**
   * A smoke with no readings yet still has an axis, and it is an axis of the
   * reader's own afternoon — an epoch-derived one would label the plot with 1970
   * clock times while they wait for the first reading.
   */
  it('gives a cook that has not started a window on the present', () => {
    const noon = new Date(2026, 0, 1, 12).getTime();

    expect(timeDomainOf([], noon)).toEqual([new Date(noon - LONE_READING_SPAN), new Date(noon)]);
  });

  it('reads the present off the clock when it is not told one', () => {
    const [, end] = timeDomainOf([]);

    expect(Math.abs(end.getTime() - Date.now())).toBeLessThan(LONE_READING_SPAN);
  });

  it('gives a cook of a single reading an axis with width in it', () => {
    const scales = createScales([cook[0]], box);

    expect(scales.x(timeOf(cook[0]))).toBeGreaterThan(40);
    expect(scales.x(timeOf(cook[0]))).toBeLessThan(350);
  });

  /**
   * A stored cook comes back from the API in whatever order the database found
   * the rows in, and that order is newest-first. Reading the span off the ends
   * of the array rather than off the readings themselves turned that into an
   * inverted axis: the clock ran backwards under the plot and the cook was
   * drawn off the side of it, over the temperature labels. The span is a fact
   * about the moments in the cook, not about where they sit in the array.
   */
  it('spans a cook that arrived newest-first the same way round', () => {
    const backwards = [...cook].reverse();

    expect(timeDomainOf(backwards)).toEqual(timeDomainOf(cook));
  });

  it('draws a cook that arrived newest-first inside the plot, left to right', () => {
    const backwards = [...cook].reverse();
    const scales = createScales(backwards, box);

    expect(scales.x(timeOf(cook[0]))).toBe(40);
    expect(scales.x(timeOf(cook[1]))).toBe(350);
  });

  /** The clock under the plot runs forwards, whichever way the rows arrived. */
  it('labels the time axis chronologically for a cook that arrived newest-first', () => {
    const moments = timeTicks(createScales([...cook].reverse(), box));

    expect(moments.map(moment => moment.getTime())).toEqual(
      [...moments].sort((a, b) => a.getTime() - b.getTime()).map(moment => moment.getTime())
    );
    expect(moments.length).toBeGreaterThan(1);
  });

  it('reaches a target the readings have not climbed to yet', () => {
    const scales = createScales(cook, box, { probe1: 400 });

    expect(scales.y(400)).toBeGreaterThanOrEqual(10);
    expect(scales.y(400)).toBeLessThanOrEqual(180);
  });

  /**
   * The chamber swings with every lid opening and reads best smoothed; a meat
   * probe climbs, and a curve through its readings would invent overshoot that
   * never happened.
   */
  it('draws the chamber on a curve and the probes straight', () => {
    const swinging = [
      at(0, { ChamberTemp: 200, MeatTemp: 100 }),
      at(15, { ChamberTemp: 260, MeatTemp: 120 }),
      at(30, { ChamberTemp: 230, MeatTemp: 140 }),
    ];
    const scales = createScales(swinging, box);

    expect(seriesPath(swinging, 'chamber', scales)).toContain('C');
    expect(seriesPath(swinging, 'probe1', scales)).not.toContain('C');
    expect(seriesPath(swinging, 'probe1', scales)).toMatch(/^M[\d.,]+L[\d.,]+L[\d.,]+$/);
  });

  it('has nothing to draw for a probe that never reported', () => {
    const oneProbe = cook.map(sample => ({ ...sample, Meat3Temp: 0 }));

    expect(seriesPath(oneProbe, 'probe3', createScales(oneProbe, box))).toBe('');
  });

  /** A probe unplugged mid-cook leaves a gap rather than a line down to zero. */
  it('breaks a line where a probe stopped reporting', () => {
    const dropped = [at(0, { MeatTemp: 100 }), at(10, { MeatTemp: 0 }), at(20, { MeatTemp: 130 })];
    const drawn = seriesPath(dropped, 'probe1', createScales(dropped, box));

    expect(drawn.match(/M/g)).toHaveLength(2);
  });

  /**
   * Readings come off the socket as `Date`s and back out of the API as ISO
   * strings, and a cook reviewed in History has to be drawn exactly as it was
   * drawn live.
   */
  it('draws readings dated with strings exactly as it draws dates', () => {
    const asStrings = cook.map(sample => ({
      ...sample,
      date: new Date(sample.date).toISOString(),
    }));

    expect(seriesPath(asStrings, 'chamber', createScales(asStrings, box))).toBe(
      seriesPath(cook, 'chamber', createScales(cook, box))
    );
  });
});

/** What the chart labels its axes with, and where the frame's lines go. */
describe('the axes', () => {
  const box = plotBoxOf('mobile');
  const cook = [
    at(0, { ChamberTemp: 200, MeatTemp: 100, Meat2Temp: 110, Meat3Temp: 120 }),
    at(30, { ChamberTemp: 250, MeatTemp: 140, Meat2Temp: 150, Meat3Temp: 160 }),
  ];

  it('labels the temperature axis with round numbers inside the axis', () => {
    const [low, high] = tempYDomain(cook);
    const ticks = tempTicks(createScales(cook, box));

    expect(ticks.length).toBeGreaterThan(1);
    ticks.forEach(tick => {
      expect(tick).toBeGreaterThanOrEqual(low);
      expect(tick).toBeLessThanOrEqual(high);
      expect(tick % 25).toBe(0);
    });
  });

  it('labels the time axis inside the span of the cook', () => {
    const ticks = timeTicks(createScales(cook, box));

    expect(ticks.length).toBeGreaterThan(1);
    ticks.forEach(tick => {
      expect(tick.getTime()).toBeGreaterThanOrEqual(timeOf(cook[0]));
      expect(tick.getTime()).toBeLessThanOrEqual(timeOf(cook[1]));
    });
  });

  /**
   * The three contexts the chart is drawn in each get a box of their own: the
   * kiosk's is a strip wider for its height than a phone's portrait column,
   * because that is the shape of the panel left under its readouts; History's
   * review card is smaller than either.
   */
  it('sizes itself for the screen it is drawn on', () => {
    const shape = (aspect: ChartAspect): number =>
      plotBoxOf(aspect).width / plotBoxOf(aspect).height;

    expect(shape('touchscreen')).toBeGreaterThan(shape('mobile'));
    expect(plotBoxOf('compact').height).toBeLessThan(plotBoxOf('mobile').height);
  });

  it('leaves room down the left for the temperature labels', () => {
    expect(plotBoxOf('mobile').margin.left).toBeGreaterThan(0);
  });
});

/** The dots the chart puts on the latest reading of each line, and under a finger. */
describe('the point a reading sits at', () => {
  const box = plotBoxOf('mobile');
  const cook = [
    at(0, { ChamberTemp: 200, MeatTemp: 100, Meat2Temp: 0, Meat3Temp: 120 }),
    at(30, { ChamberTemp: 250, MeatTemp: 140, Meat2Temp: 0, Meat3Temp: 0 }),
  ];
  const scales = createScales(cook, box);

  it('sits where the scales put that reading', () => {
    expect(pointOf(cook[1], 'chamber', scales)).toEqual({
      x: scales.x(timeOf(cook[1])),
      y: scales.y(250),
    });
  });

  it('has no point for a reading the probe did not take', () => {
    expect(pointOf(cook[0], 'probe2', scales)).toBeNull();
  });

  it('marks the latest reading a probe actually took', () => {
    expect(latestPointOf(cook, 'probe3', scales)).toEqual({
      x: scales.x(timeOf(cook[0])),
      y: scales.y(120),
    });
  });

  it('marks nothing for a probe that never reported', () => {
    expect(latestPointOf(cook, 'probe2', scales)).toBeNull();
  });
});

/** How a reading and a moment are written out, wherever the chart writes them. */
describe('labels', () => {
  it('writes a temperature as whole degrees', () => {
    expect(formatTemperature(203.4)).toBe('203°');
  });

  it('writes a moment as a clock time', () => {
    expect(formatClock(new Date(2026, 0, 1, 13, 5))).toBe(
      new Date(2026, 0, 1, 13, 5).toLocaleTimeString()
    );
  });
});

/**
 * A touch lands in screen pixels on an SVG that has been scaled to whatever
 * width the phone gave it; these are the two sums that turn that into a moment
 * of the cook and a place to put the card describing it.
 */
describe('a touch on the plot', () => {
  const box = plotBoxOf('mobile');
  const cook = [at(0), at(30)];
  const scales = createScales(cook, box);

  it("reads the moment under the finger through the chart's own scaling", () => {
    const shownAt = { left: 20, width: box.width * 2 };
    const middleOfThePlot = (box.margin.left + box.width - box.margin.right) / 2;

    const halfway = momentAt(shownAt.left + middleOfThePlot * 2, shownAt, box, scales);

    expect(Math.round(halfway)).toBe(Math.round((timeOf(cook[0]) + timeOf(cook[1])) / 2));
  });

  it("reads a touch on an unmeasured chart in the chart's own coordinates", () => {
    const unmeasured = { left: 0, width: 0 };

    expect(momentAt(box.margin.left, unmeasured, box, scales)).toBe(timeOf(cook[0]));
  });

  it('puts the card beside the finger', () => {
    const card = { width: 120, height: 90 };

    expect(cardPlacement(180, box, card).x).toBeGreaterThan(180);
  });

  it('keeps the card on the chart when the finger is near an edge', () => {
    const card = { width: 120, height: 90 };

    const atTheRight = cardPlacement(box.width - 4, box, card);
    const atTheLeft = cardPlacement(0, box, card);

    expect(atTheRight.x + card.width).toBeLessThanOrEqual(box.width);
    expect(atTheLeft.x).toBeGreaterThanOrEqual(0);
    expect(atTheRight.y).toBeGreaterThanOrEqual(0);
    expect(atTheRight.y + card.height).toBeLessThanOrEqual(box.height);
  });
});

/**
 * Where the writing goes: the labels sit outside the plot so they never cross
 * the data, and the card's rows sit inside the card so none of them fall off it.
 */
describe('the places the chart writes in', () => {
  const box = plotBoxOf('mobile');

  it('holds the plot inside the margins of its box', () => {
    const edges = plotEdges(box);

    expect(edges.left).toBe(box.margin.left);
    expect(edges.right).toBe(box.width - box.margin.right);
    expect(edges.top).toBe(box.margin.top);
    expect(edges.bottom).toBe(box.height - box.margin.bottom);
  });

  it('writes the temperature labels left of the plot and the times below it', () => {
    const anchors = axisLabelAnchors(box);
    const edges = plotEdges(box);

    expect(anchors.tempX).toBeLessThan(edges.left);
    expect(anchors.timeY).toBeGreaterThan(edges.bottom);
    expect(anchors.timeY).toBeLessThanOrEqual(box.height);
  });

  it('spaces the card rows evenly and keeps them on the card', () => {
    const card = { width: 128, height: 82 };
    const laid = cardLayout({ x: 40, y: 12 }, card, 4);

    expect(laid.labelX).toBeGreaterThan(40);
    expect(laid.valueX).toBeLessThan(40 + card.width);
    expect(laid.headingY).toBeGreaterThan(12);
    expect(laid.rowsY).toHaveLength(4);
    expect(laid.rowsY[1] - laid.rowsY[0]).toBe(laid.rowsY[3] - laid.rowsY[2]);
    laid.rowsY.forEach(y => expect(y).toBeLessThanOrEqual(12 + card.height));
  });
});

/**
 * A target line runs the width of the plot, so its label has to sit at the end
 * of it and clear of the dashes, or the temperature it names is written across
 * the line that names it.
 */
describe('where a target line is labelled', () => {
  const box = plotBoxOf('mobile');

  it('writes the label at the end of the line and just above it', () => {
    const line = 90;

    const anchor = targetLabelAnchor(box, line);

    expect(anchor.x).toBe(plotEdges(box).right);
    expect(anchor.y).toBeLessThan(line);
    expect(line - anchor.y).toBeLessThanOrEqual(LABEL_SIZE);
  });

  it('keeps the label with its own line as that line moves', () => {
    expect(targetLabelAnchor(box, 40).y).toBeLessThan(targetLabelAnchor(box, 120).y);
  });
});
