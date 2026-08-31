/**
 * What the cook picker narrows the archive by, and in what order it hands the
 * result back.
 *
 * The picker exists because a pitmaster half-remembers a cook — "the pork one,
 * on cherry, some time in July" — so every one of those fragments has to find
 * it, and the order it comes back in has to be the one the pitmaster asked for.
 * These are the decisions behind that, asserted without rendering a sheet.
 */
import { SmokeHistory } from '../../../api/types';
import { selectPickerCooks } from './cookPickerQuery';

const cook = (fields: Partial<SmokeHistory> & { smokeId: string }): SmokeHistory => ({
  name: 'A cook',
  meatType: 'Beef',
  weight: '12',
  weightUnit: 'LB',
  woodType: 'Hickory',
  date: 'Aug 1, 2026',
  overAllRating: '7',
  durationMs: 3600000,
  notes: [],
  ...fields,
});

/** The archive as the history read hands it over: newest cook first. */
const archive: SmokeHistory[] = [
  cook({
    smokeId: 'brisket',
    name: 'Backyard brisket',
    meatType: 'Beef',
    woodType: 'Oak',
    date: 'Aug 1, 2026',
    overAllRating: '8.5',
  }),
  cook({
    smokeId: 'pork',
    name: 'Pulled pork',
    meatType: 'Pork',
    woodType: 'Cherry',
    date: 'Jul 4, 2026',
    overAllRating: '6',
  }),
  cook({
    smokeId: 'ribs',
    name: 'Baby backs',
    meatType: 'Pork',
    woodType: 'Hickory',
    date: 'Jun 12, 2026',
    overAllRating: '9',
  }),
];

const idsOf = (cooks: readonly SmokeHistory[]): string[] => cooks.map(one => one.smokeId);

describe('selectPickerCooks', () => {
  test('with nothing typed or chosen, every cook is offered newest first', () => {
    const { shown, total } = selectPickerCooks(archive, { query: '', meats: [], sort: 'recent' });

    expect(idsOf(shown)).toEqual(['brisket', 'pork', 'ribs']);
    expect(total).toBe(3);
  });

  /**
   * The four fragments a cook is remembered by. The date is searched as it is
   * written on the card, because that is the form the user has seen it in.
   */
  test.each([
    ['a name', 'pulled', ['pork']],
    ['a meat', 'beef', ['brisket']],
    ['a wood', 'cherry', ['pork']],
    ['a date', 'jul', ['pork']],
  ])('the search finds a cook by %s', (_what, query, expected) => {
    const { shown } = selectPickerCooks(archive, { query, meats: [], sort: 'recent' });

    expect(idsOf(shown)).toEqual(expected);
  });

  test('the search ignores case and surrounding space', () => {
    const { shown } = selectPickerCooks(archive, {
      query: '  BABY  ',
      meats: [],
      sort: 'recent',
    });

    expect(idsOf(shown)).toEqual(['ribs']);
  });

  test('the meat chips are every meat in the archive, once each', () => {
    const { meatTypes } = selectPickerCooks(archive, { query: '', meats: [], sort: 'recent' });

    expect(meatTypes).toEqual(['Beef', 'Pork']);
  });

  test('a chosen meat narrows the list, and no chosen meat means every meat', () => {
    const { shown } = selectPickerCooks(archive, { query: '', meats: ['Pork'], sort: 'recent' });

    expect(idsOf(shown)).toEqual(['pork', 'ribs']);
  });

  /**
   * Search and chips are two narrowings of one list, not two lists: a pitmaster
   * who has chosen pork and typed "cherry" is asking for the cook that is both.
   */
  test('the search and the chips narrow the same list together', () => {
    const { shown, total } = selectPickerCooks(archive, {
      query: 'cherry',
      meats: ['Pork'],
      sort: 'recent',
    });

    expect(idsOf(shown)).toEqual(['pork']);
    // The count the header reads out is against the whole archive, not against
    // what the last narrowing left: "1 of 3 sessions" is the answer to "did my
    // search work", which "1 of 1" is not.
    expect(total).toBe(3);
  });

  test('a narrowing that matches nothing shows nothing rather than everything', () => {
    const { shown } = selectPickerCooks(archive, {
      query: 'lamb',
      meats: [],
      sort: 'recent',
    });

    expect(shown).toEqual([]);
  });

  test('the best-rated cook comes first when sorting by rating', () => {
    const { shown } = selectPickerCooks(archive, { query: '', meats: [], sort: 'rated' });

    expect(idsOf(shown)).toEqual(['ribs', 'brisket', 'pork']);
  });

  /** A cook nobody rated is still offered — it just sorts below the rated ones. */
  test('an unrated cook sorts last by rating rather than dropping out', () => {
    const unrated = cook({ smokeId: 'unrated', name: 'Unscored', overAllRating: '' });

    const { shown } = selectPickerCooks([unrated, ...archive], {
      query: '',
      meats: [],
      sort: 'rated',
    });

    expect(idsOf(shown)).toEqual(['ribs', 'brisket', 'pork', 'unrated']);
  });

  test('A–Z sorts by name, whatever case it was typed in', () => {
    const { shown } = selectPickerCooks(archive, { query: '', meats: [], sort: 'name' });

    expect(idsOf(shown)).toEqual(['ribs', 'brisket', 'pork']);
  });

  /**
   * A cook nobody named has no place in an alphabet, so it goes to the end
   * rather than to the top where an empty string would sort it.
   */
  test('a cook nobody named sorts last alphabetically', () => {
    const unnamed = cook({ smokeId: 'unnamed', name: '' });
    const alsoUnnamed = cook({ smokeId: 'also-unnamed', name: '' });

    const { shown } = selectPickerCooks([unnamed, alsoUnnamed, ...archive], {
      query: '',
      meats: [],
      sort: 'name',
    });

    // Two of them keep the order they arrived in — there is nothing to tell
    // them apart alphabetically, and the archive's own order is the next best
    // answer.
    expect(idsOf(shown)).toEqual(['ribs', 'brisket', 'pork', 'unnamed', 'also-unnamed']);
  });

  /**
   * A chip can outlive the cooks it was chosen about — the archive is re-read
   * while the sheet is open and the last pork cook is gone. Honouring it would
   * empty the list behind a filter with no chip left to unpick.
   */
  test('a chosen meat the archive no longer holds stops narrowing', () => {
    const beefOnly = [archive[0]];

    const { shown, meats } = selectPickerCooks(beefOnly, {
      query: '',
      meats: ['Pork'],
      sort: 'recent',
    });

    expect(idsOf(shown)).toEqual(['brisket']);
    expect(meats).toEqual([]);
  });
});
