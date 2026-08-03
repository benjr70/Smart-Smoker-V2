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

  // Ribs belong to whichever animal the description names. Reading every rib as
  // pork would put 195°F on a prime rib somebody wanted pulled at 130°F.
  it.each([
    ['Prime rib', 'beef'],
    ['Short ribs', 'beef'],
    ['Beef back ribs', 'beef'],
    ['Baby back ribs', 'pork'],
    ['Spare ribs', 'pork'],
    ['St louis ribs', 'pork'],
  ])('reads %s as %s', (meatType, category) => {
    expect(matchMeatCategory(meatType)).toBe(category);
  });

  // A cut can belong to more than one animal, and the one the cook named is the
  // one that counts — the description says so outright.
  it.each([
    ['Pork sirloin roast', 'pork'],
    ['Turkey bacon', 'poultry'],
    ['Beef sausage', 'beef'],
    ['Chicken sausage', 'poultry'],
  ])('reads %s as the animal it names, not the cut', (meatType, category) => {
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
    // A cut on its own says nothing about the animal it came off. Lamb and fish
    // are not categories this app keeps a temperature for, and seeding them
    // with beef's or pork's would ruin the cook it was guessing at.
    ['Lamb shoulder'],
    ['Rack of lamb'],
    ['Tuna steak'],
    ['Venison steaks'],
    // Ribs unqualified could be either animal, 65°F apart. Silence beats a
    // coin toss.
    ['Ribs'],
    [''],
    [undefined],
    [null],
  ])('recognises no category in %s', (meatType) => {
    expect(matchMeatCategory(meatType)).toBeNull();
  });
});
