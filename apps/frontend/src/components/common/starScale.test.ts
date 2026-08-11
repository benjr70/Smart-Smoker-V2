import { starStates } from './starScale';

describe('scaling a ten-point score onto five stars', () => {
  it('fills a star per two points, and half a star for the odd one', () => {
    expect(starStates(10)).toEqual(['full', 'full', 'full', 'full', 'full']);
    expect(starStates(5)).toEqual(['full', 'full', 'half', 'empty', 'empty']);
    expect(starStates(0)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
  });

  it('half-fills the star a fractional score has reached but not passed', () => {
    expect(starStates(9)).toEqual(['full', 'full', 'full', 'full', 'half']);
    expect(starStates(7.5)).toEqual(['full', 'full', 'full', 'half', 'empty']);
    expect(starStates(0.5)).toEqual(['half', 'empty', 'empty', 'empty', 'empty']);
  });

  it('shows no stars for a score that is missing, and never more than five', () => {
    // A cook that was never rated arrives as an unparseable score; it reads as
    // unrated rather than as a row of broken stars.
    expect(starStates(Number.NaN)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
    expect(starStates(-3)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
    expect(starStates(42)).toEqual(['full', 'full', 'full', 'full', 'full']);
  });
});
