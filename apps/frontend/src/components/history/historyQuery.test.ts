import { selectHistory } from './historyQuery';

const session = (fields: Partial<Parameters<typeof selectHistory>[0][number]> = {}) => ({
  name: 'Sunday Brisket',
  meatType: 'Brisket',
  woodType: 'Hickory',
  ...fields,
});

describe('the history query', () => {
  it('keeps the sessions whose name contains the query, whatever the case', () => {
    const brisket = session({ name: 'Sunday Brisket' });
    const ribs = session({ name: 'Baby Back Ribs' });

    const { shown } = selectHistory([brisket, ribs], { query: 'sunday', meats: [] });

    expect(shown).toEqual([brisket]);
  });

  it('searches the meat, the wood and every note as well as the name', () => {
    const byMeat = session({ name: 'Sunday cook', meatType: 'Pork Shoulder' });
    const byWood = session({ name: 'Monday cook', woodType: 'Applewood' });
    const byNote = session({ name: 'Tuesday cook', notes: ['spritzed with apple juice'] });
    const unrelated = session({ name: 'Friday cook' });

    const { shown } = selectHistory([byMeat, byWood, byNote, unrelated], {
      query: 'APPLE',
      meats: [],
    });

    expect(shown).toEqual([byWood, byNote]);
  });

  /**
   * The day as the card writes it, because that is the form the user has read
   * it in and will type a fragment of.
   */
  it('searches the day the cook happened, as it is written on the card', () => {
    const july = session({ name: 'Sunday cook', date: 'Jul 4, 2026' });
    const august = session({ name: 'Monday cook', date: 'Aug 1, 2026' });

    const { shown } = selectHistory([july, august], { query: 'jul', meats: [] });

    expect(shown).toEqual([july]);
  });

  it('keeps any of the chosen meats, and narrows them further by the search', () => {
    const brisket = session({ name: 'Sunday Brisket', meatType: 'Brisket' });
    const pork = session({ name: 'Pulled pork', meatType: 'Pork' });
    const otherPork = session({ name: 'Weeknight chops', meatType: 'Pork' });
    const chicken = session({ name: 'Sunday chicken', meatType: 'Chicken' });
    const sessions = [brisket, pork, otherPork, chicken];

    expect(selectHistory(sessions, { query: '', meats: ['Brisket', 'Pork'] }).shown).toEqual([
      brisket,
      pork,
      otherPork,
    ]);
    expect(selectHistory(sessions, { query: 'sunday', meats: ['Brisket', 'Pork'] }).shown).toEqual([
      brisket,
    ]);
  });

  it('offers each meat in the whole list once as a chip, whatever is filtered', () => {
    const sessions = [
      session({ meatType: 'Brisket' }),
      session({ meatType: 'Pork' }),
      session({ meatType: 'Brisket' }),
      session({ meatType: '' }),
    ];

    const { meatTypes } = selectHistory(sessions, { query: 'nothing matches this', meats: [] });

    // In the order they appear, deduplicated, and with the blank meat of a
    // session that never named one left out — there is no chip to draw for it.
    expect(meatTypes).toEqual(['Brisket', 'Pork']);
  });

  it('drops a chosen meat the list no longer holds, rather than hiding every cook behind it', () => {
    // The cook that was the only Pork one has just been deleted, so its chip
    // is gone from the header — but the choice made while it was there is
    // still in hand. A filter with no chip to unpick it is a list a user
    // cannot get back.
    const brisket = session({ name: 'Sunday Brisket', meatType: 'Brisket' });
    const chicken = session({ name: 'Beer can chicken', meatType: 'Chicken' });

    const selection = selectHistory([brisket, chicken], { query: '', meats: ['Pork'] });

    expect(selection.shown).toEqual([brisket, chicken]);
    expect(selection.meats).toEqual([]);
    expect(selection.filtering).toBe(false);
    expect(selection.emptyState).toBeNull();
  });

  it('keeps the chosen meats the list still holds when one of them goes', () => {
    const brisket = session({ name: 'Sunday Brisket', meatType: 'Brisket' });
    const chicken = session({ name: 'Beer can chicken', meatType: 'Chicken' });

    const selection = selectHistory([brisket, chicken], { query: '', meats: ['Pork', 'Brisket'] });

    expect(selection.shown).toEqual([brisket]);
    expect(selection.meats).toEqual(['Brisket']);
    expect(selection.filtering).toBe(true);
  });

  it('tells an empty history apart from a filter that matched nothing', () => {
    const sessions = [session({ name: 'Sunday Brisket' })];
    const noFilters = { query: '', meats: [] };

    expect(selectHistory([], noFilters).emptyState).toBe('never-smoked');
    expect(selectHistory(sessions, { query: 'pastrami', meats: [] }).emptyState).toBe('no-matches');
    expect(selectHistory(sessions, noFilters).emptyState).toBeNull();
    // A history with nothing in it is empty whatever is typed into the search:
    // there is nothing to clear the filters back to.
    expect(selectHistory([], { query: 'pastrami', meats: [] }).emptyState).toBe('never-smoked');
  });

  it('counts blank search text as no search at all', () => {
    const sessions = [session({ name: 'Sunday Brisket' })];

    expect(selectHistory(sessions, { query: '   ', meats: [] }).filtering).toBe(false);
    expect(selectHistory(sessions, { query: 'sun', meats: [] }).filtering).toBe(true);
    expect(selectHistory(sessions, { query: '', meats: ['Brisket'] }).filtering).toBe(true);
  });
});
