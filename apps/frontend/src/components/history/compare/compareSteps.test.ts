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
   * A step written twice in one cook's list is one thing that cook did — a
   * spritz logged as two rows is one instruction typed twice, not two steps —
   * so it is stated once, however many rows it was typed into.
   */
  test('a step repeated within one cook’s list is one step', () => {
    expect(diffSteps(['Spritz', 'spritz ', 'Trim'], ['Spritz'])).toEqual({
      both: ['Spritz'],
      onlyA: ['Trim'],
      onlyB: [],
    });
  });

  test('a step only one cook did, repeated, is still listed once', () => {
    expect(diffSteps(['Spritz', 'Spritz'], ['Trim', 'Trim'])).toEqual({
      both: [],
      onlyA: ['Spritz'],
      onlyB: ['Trim'],
    });
  });

  /** A record too old to hold a step list is a cook that did no steps, not a crash. */
  test('a record with no step list at all reads as no steps', () => {
    expect(diffSteps(undefined, ['Brine'])).toEqual({ both: [], onlyA: [], onlyB: ['Brine'] });
  });
});
