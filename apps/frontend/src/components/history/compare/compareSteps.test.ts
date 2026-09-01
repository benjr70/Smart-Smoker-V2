/**
 * Which steps the two cooks shared, and which belong to one of them alone.
 *
 * Asserted directly rather than through the card that draws it: what counts as
 * "the same step" is the substance of the diff, and the edge cases worth
 * pinning — a step retyped in a different case, a blank row left in the editor,
 * two cooks with nothing in common — are all statements about the split, not
 * about how it is rendered.
 */
import { diffSteps } from './compareSteps';

describe('diffSteps', () => {
  test('splits the two step lists into shared, A-only and B-only', () => {
    expect(diffSteps(['Trim', 'Rub', 'Inject'], ['Trim', 'Brine'])).toEqual({
      both: ['Trim'],
      onlyA: ['Rub', 'Inject'],
      onlyB: ['Brine'],
    });
  });

  /**
   * The same instruction typed on two different days rarely comes back
   * character-identical, and a diff that called "Trim fat cap" and
   * "trim fat cap " two different steps would report a difference nobody made.
   */
  test('matches steps ignoring case and surrounding whitespace', () => {
    expect(diffSteps(['Trim fat cap'], ['  trim FAT cap '])).toEqual({
      both: ['Trim fat cap'],
      onlyA: [],
      onlyB: [],
    });
  });

  /** Shown as each cook wrote it, however it was matched. */
  test('keeps each step as its cook wrote it', () => {
    expect(diffSteps(['Trim fat cap'], ['trim fat cap']).both).toEqual(['Trim fat cap']);
  });

  test('two cooks that did the same things have no differences', () => {
    expect(diffSteps(['Trim', 'Rub'], ['Rub', 'Trim'])).toEqual({
      both: ['Trim', 'Rub'],
      onlyA: [],
      onlyB: [],
    });
  });

  test('two cooks with nothing in common share nothing', () => {
    expect(diffSteps(['Trim'], ['Brine'])).toEqual({
      both: [],
      onlyA: ['Trim'],
      onlyB: ['Brine'],
    });
  });

  /**
   * An empty row in the step editor is a row nobody filled in, not a step one
   * cook did and the other skipped.
   */
  test('blank steps are not steps', () => {
    expect(diffSteps(['Trim', '', '   '], ['Trim', ''])).toEqual({
      both: ['Trim'],
      onlyA: [],
      onlyB: [],
    });
  });

  test('a cook with no steps at all still diffs', () => {
    expect(diffSteps([], ['Brine'])).toEqual({ both: [], onlyA: [], onlyB: ['Brine'] });
    expect(diffSteps([], [])).toEqual({ both: [], onlyA: [], onlyB: [] });
  });

  /**
   * A cook that logged two spritzes did two things, so both rows survive the
   * diff: the split reports what a cook recorded, and quietly collapsing a
   * repeat would drop a step out of that cook's history on the way to the
   * screen.
   */
  test('a step one cook did twice is listed twice', () => {
    expect(diffSteps(['Spritz', 'spritz ', 'Trim'], ['Spritz'])).toEqual({
      both: ['Spritz', 'spritz '],
      onlyA: ['Trim'],
      onlyB: [],
    });
  });

  test('a step only one cook did, repeated, is listed as often as it was done', () => {
    expect(diffSteps(['Spritz', 'Spritz'], ['Trim', 'Trim'])).toEqual({
      both: [],
      onlyA: ['Spritz', 'Spritz'],
      onlyB: ['Trim', 'Trim'],
    });
  });

  /** A record too old to hold a step list is a cook that did no steps, not a crash. */
  test('a record with no step list at all reads as no steps', () => {
    expect(diffSteps(undefined, ['Brine'])).toEqual({ both: [], onlyA: [], onlyB: ['Brine'] });
  });
});
