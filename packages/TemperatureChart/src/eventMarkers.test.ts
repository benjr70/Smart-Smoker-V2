/**
 * Where the marks a pitmaster left on a cook are drawn, and which one a finger
 * is resting on. All of it is arithmetic on values, so none of it needs a
 * browser: a marker is a place, a row and a letter.
 */
import { ChartEvent, nearestEvent, placeMarkers, sampleWidth } from './eventMarkers';

/** A scale standing in for the chart's: a minute of the cook is ten pixels. */
const x = (moment: number): number => moment / 6_000;

const stamp = (id: string, minute: number, rest: Partial<ChartEvent> = {}): ChartEvent => ({
  id,
  label: 'Wrapped',
  color: '#DA4A2E',
  at: minute * 60_000,
  ...rest,
});

/** The whole of a two-hour cook, as the chart's time axis has it. */
const window = { from: 0, to: 120 * 60_000 };

describe('placing the markers', () => {
  it('puts one marker per event where its moment falls, in its own colour', () => {
    const placed = placeMarkers(
      [stamp('a', 30, { label: 'Spritzed', color: '#2A6FB8' }), stamp('b', 60)],
      x,
      window
    );

    expect(placed).toHaveLength(2);
    expect(placed[0]).toMatchObject({ id: 'a', x: 300, letter: 'S', color: '#2A6FB8', row: 0 });
    expect(placed[1]).toMatchObject({ id: 'b', x: 600, letter: 'W', color: '#DA4A2E', row: 0 });
  });

  /** A stamp nobody has named still has to be drawn as something. */
  it('marks an unnamed stamp with a dot rather than a letter', () => {
    expect(placeMarkers([stamp('a', 30, { label: '  ' })], x, window)[0].letter).toBe('\u2022');
  });
});

describe('bubbles that would print over each other', () => {
  /**
   * Ten spritzes in an hour is a real cook, and six bubbles in the same inch of
   * plot is an unreadable blob. Neighbours closer than a bubble is wide take
   * turns on a second row instead.
   */
  it('drops a neighbour closer than the gap onto the second row', () => {
    const placed = placeMarkers([stamp('a', 30), stamp('b', 31), stamp('c', 32)], x, window);

    expect(placed.map(marker => marker.row)).toEqual([0, 1, 0]);
  });

  it('leaves a neighbour with room to itself on the first row', () => {
    const placed = placeMarkers([stamp('a', 30), stamp('b', 33)], x, window);

    expect(placed.map(marker => marker.row)).toEqual([0, 0]);
  });

  /**
   * The rows are decided along the plot, so a log handed over out of order —
   * which is every log read back from a store that answers newest-first — is
   * staggered against the neighbours it actually has.
   */
  it('staggers by where the markers sit, not by the order it was handed', () => {
    const placed = placeMarkers([stamp('b', 31), stamp('a', 30)], x, window);

    expect(placed.map(marker => marker.id)).toEqual(['a', 'b']);
    expect(placed.map(marker => marker.row)).toEqual([0, 1]);
  });
});

describe('events the chart is not currently showing', () => {
  it('leaves out an event from outside the drawn window', () => {
    const placed = placeMarkers(
      [stamp('before', -10), stamp('inside', 30), stamp('after', 200)],
      x,
      window
    );

    expect(placed.map(marker => marker.id)).toEqual(['inside']);
  });

  it('leaves out an event whose moment reads as no moment at all', () => {
    const placed = placeMarkers([stamp('broken', 0, { at: 'not a date' })], x, window);

    expect(placed).toEqual([]);
  });
});

describe('the marker under the finger', () => {
  const placed = placeMarkers([stamp('a', 30), stamp('b', 60)], x, window);

  it('names the nearest marker within reach of the touch', () => {
    expect(nearestEvent(placed, 592, 10)?.id).toBe('b');
  });

  it('names nothing when the touch is further off than the tolerance', () => {
    expect(nearestEvent(placed, 450, 10)).toBeUndefined();
  });

  it('names nothing when there are no markers at all', () => {
    expect(nearestEvent([], 300, 10)).toBeUndefined();
  });
});

describe('how close counts as touching a marker', () => {
  /**
   * "Near a marker" means within one reading of it, so the tolerance follows
   * the cook: a twelve-hour brisket has its readings packed tight and asks for
   * a tighter touch than the first minutes of one do.
   */
  it('measures one reading of the cook across the plot', () => {
    expect(sampleWidth(5, { left: 40, right: 360 })).toBe(80);
  });

  it('treats a cook of one reading as the whole plot wide', () => {
    expect(sampleWidth(1, { left: 40, right: 360 })).toBe(320);
  });
});
