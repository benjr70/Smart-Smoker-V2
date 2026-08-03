import { matchMeatCategory } from './meat-presets';

describe('matching a meat type to a preset category', () => {
  it('reads a brisket as beef', () => {
    expect(matchMeatCategory('Brisket')).toBe('beef');
  });

  // Nobody types a category into the pre-smoke form: they type what they are
  // cooking, in whatever case and with whatever detail they feel like.
  it('reads the meat out of a longer description, whatever its case', () => {
    expect(matchMeatCategory('Whole CHICKEN, spatchcocked')).toBe('poultry');
  });

  // The vocabulary is what people actually smoke, not the category names: a
  // rack of ribs is never described as "pork" by the person cooking it.
  it.each([
    ['Baby back ribs', 'pork'],
    ['Pork shoulder', 'pork'],
    ['Boston butt', 'pork'],
    ['Pulled pork', 'pork'],
    ['Chuck roast', 'beef'],
    ['Tri-tip', 'beef'],
    ['Beef ribs', 'beef'],
    ['Turkey breast', 'poultry'],
    ['Smoked wings', 'poultry'],
  ])('reads %s as %s', (meatType, category) => {
    expect(matchMeatCategory(meatType)).toBe(category);
  });

  // Nothing is seeded from a meat this list has never heard of: guessing would
  // put somebody else's done temperature on a cook the user never checked.
  it.each([
    ['Salmon fillet'],
    ['Jackfruit'],
    // A keyword buried inside another word is not that meat: a hamburger is
    // not a ham, and a ribeye is not a rack of ribs.
    ['Hamburgers'],
    [''],
    [undefined],
    [null],
  ])('recognises no category in %s', (meatType) => {
    expect(matchMeatCategory(meatType)).toBeNull();
  });
});
