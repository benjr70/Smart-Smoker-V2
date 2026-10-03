/**
 * Extraction contract table.
 *
 * Every rule about what a Ramble fills on the pre-smoke and post-smoke screens,
 * driven through the contract's public interface with no model in sight: a raw
 * object such as a model would return goes in with the screen's current values,
 * and the Review rows — and, for a ticked set of them, the values to write and
 * what Undo restores — come out.
 */
import { PostSmoke, PreSmoke } from '../api/types';
import { WeightUnits } from '../components/common/interfaces/enums';
import { fillFor, reviewRows } from '.';

// Saturday 3 October 2026, mid-afternoon, in whatever zone the suite runs in:
// the invented name takes the weekday the cook's phone would show.
const SATURDAY = new Date(2026, 9, 3, 15, 0);

const emptyPreSmoke = (overrides: Partial<PreSmoke> = {}): PreSmoke => ({
  name: '',
  meatType: '',
  weight: { unit: WeightUnits.LB },
  steps: [''],
  notes: '',
  ...overrides,
});

const preSmokeRow = (raw: unknown, current: PreSmoke, field: keyof PreSmoke) =>
  reviewRows('preSmoke', raw, current, SATURDAY).find(row => row.field === field);

describe('name', () => {
  it('overwrites the name with a spoken one', () => {
    const row = preSmokeRow(
      { name: 'Sunday brisket' },
      emptyPreSmoke({ name: 'Old name' }),
      'name'
    );

    expect(row).toMatchObject({ oldValue: 'Old name', newValue: 'Sunday brisket' });
  });

  it('builds the name from the weekday and the meat when none is spoken and the field is empty', () => {
    const row = preSmokeRow({}, emptyPreSmoke({ meatType: 'Brisket' }), 'name');

    expect(row).toMatchObject({ oldValue: '', newValue: 'Saturday Brisket' });
  });

  it('builds no name when no meat type is known', () => {
    expect(preSmokeRow({}, emptyPreSmoke(), 'name')).toBeUndefined();
  });

  it('never replaces a name already there with an invented one', () => {
    const current = emptyPreSmoke({ name: 'Mine', meatType: 'Brisket' });

    expect(preSmokeRow({ meatType: 'Ribs' }, current, 'name')).toBeUndefined();
  });

  it('builds the name from the meat this Ramble names', () => {
    const row = preSmokeRow({ meatType: 'ribs' }, emptyPreSmoke({ meatType: 'Brisket' }), 'name');

    expect(row).toMatchObject({ newValue: 'Saturday Ribs' });
  });

  it('proposes no row for a spoken name the field already holds', () => {
    const current = emptyPreSmoke({ name: 'Sunday brisket' });

    expect(preSmokeRow({ name: ' Sunday brisket ' }, current, 'name')).toBeUndefined();
  });
});

describe('meat type', () => {
  it.each([
    ['snaps a match in any case to the list spelling', 'pork shoulder', 'Pork Shoulder'],
    [
      'keeps a cut not on the list as spoken, first letter capitalised',
      'beef cheeks',
      'Beef cheeks',
    ],
    ['does not snap a near miss', 'briskets', 'Briskets'],
  ])('%s', (_rule, spoken, expected) => {
    const row = preSmokeRow(
      { meatType: spoken },
      emptyPreSmoke({ meatType: 'Turkey' }),
      'meatType'
    );

    expect(row).toMatchObject({ oldValue: 'Turkey', newValue: expected });
  });
});

describe('weight', () => {
  it.each([
    ['takes a plain number', { weight: 12.5 }, WeightUnits.LB, 12.5, WeightUnits.LB],
    [
      'leaves the unit on screen when none is spoken',
      { weight: 5 },
      WeightUnits.KG,
      5,
      WeightUnits.KG,
    ],
    ['takes a spoken unit', { weight: 8, weightUnit: 'OZ' }, WeightUnits.LB, 8, WeightUnits.OZ],
    [
      'reads a unit however the model spells it',
      { weight: 2, weightUnit: 'kilos' },
      WeightUnits.LB,
      2,
      WeightUnits.KG,
    ],
    [
      'changes only the unit when only a unit is spoken',
      { weightUnit: 'kg' },
      WeightUnits.LB,
      3,
      WeightUnits.KG,
    ],
    ['drops "about"', { weight: 'about 12' }, WeightUnits.LB, 12, WeightUnits.LB],
    ['accepts the upper bound itself', { weight: 200 }, WeightUnits.LB, 200, WeightUnits.LB],
  ])('%s', (_rule, raw, unitOnScreen, weight, unit) => {
    const current = emptyPreSmoke({ weight: { weight: 3, unit: unitOnScreen } });

    expect(preSmokeRow(raw, current, 'weight')).toMatchObject({
      oldValue: { weight: 3, unit: unitOnScreen },
      newValue: { weight, unit },
    });
  });

  it.each([
    ['a range', { weight: '12 to 13', weightUnit: 'LB' }, 'Weight: 12 to 13 LB.'],
    ['a range given as two numbers', { weight: [12, 13] }, 'Weight: 12 to 13.'],
    ['a weight of nothing', { weight: 0 }, 'Weight: 0.'],
    ['a weight over the upper bound', { weight: 250 }, 'Weight: 250.'],
    ['a unit the screen does not offer', { weight: 2, weightUnit: 'stone' }, 'Weight: 2 stone.'],
  ])('fills nothing for %s and keeps it for Notes', (_rule, raw, leftover) => {
    const current = emptyPreSmoke({ weight: { weight: 3, unit: WeightUnits.LB } });

    expect(preSmokeRow(raw, current, 'weight')).toBeUndefined();
    expect(preSmokeRow(raw, current, 'notes')).toMatchObject({ oldValue: '', newValue: leftover });
  });

  it.each([
    [
      'the unit already on screen, with no weight entered',
      { weightUnit: 'LB' },
      { unit: WeightUnits.LB },
    ],
    [
      'the weight the form already holds as typed',
      { weight: 12 },
      { weight: '12', unit: WeightUnits.LB },
    ],
  ])('proposes no row for %s', (_rule, raw, onScreen) => {
    const current = emptyPreSmoke({ weight: onScreen as unknown as PreSmoke['weight'] });

    expect(preSmokeRow(raw, current, 'weight')).toBeUndefined();
  });
});

describe('steps', () => {
  it('appends the spoken steps in spoken order and lists only those in the row', () => {
    const current = emptyPreSmoke({ steps: ['Trim the fat cap'] });

    const row = preSmokeRow({ steps: ['mustard binder', 'Salt and pepper'] }, current, 'steps');

    expect(row).toMatchObject({
      oldValue: ['Trim the fat cap'],
      newValue: ['Trim the fat cap', 'Mustard binder', 'Salt and pepper'],
      added: ['Mustard binder', 'Salt and pepper'],
    });
  });

  it('skips a step equal to one already there, ignoring case and punctuation', () => {
    const current = emptyPreSmoke({ steps: ['Trim the fat cap.'] });

    const row = preSmokeRow({ steps: ['trim, the fat cap', 'Mustard binder'] }, current, 'steps');

    expect(row).toMatchObject({
      newValue: ['Trim the fat cap.', 'Mustard binder'],
      added: ['Mustard binder'],
    });
  });

  it('adds a step said twice in one Ramble once', () => {
    const row = preSmokeRow(
      { steps: ['Season', 'season!'] },
      emptyPreSmoke({ steps: [] }),
      'steps'
    );

    expect(row).toMatchObject({ newValue: ['Season'], added: ['Season'] });
  });

  it('proposes no row when every spoken step is already there', () => {
    const current = emptyPreSmoke({ steps: ['Season'] });

    expect(preSmokeRow({ steps: ['season.'] }, current, 'steps')).toBeUndefined();
  });

  it('writes over the empty line an untouched list ends with', () => {
    const current = emptyPreSmoke({ steps: ['Trim', ''] });

    const row = preSmokeRow({ steps: ['Season'] }, current, 'steps');

    expect(row).toMatchObject({ oldValue: ['Trim', ''], newValue: ['Trim', 'Season'] });
  });
});

const emptyPostSmoke = (overrides: Partial<PostSmoke> = {}): PostSmoke => ({
  restTime: '',
  steps: [''],
  notes: '',
  ...overrides,
});

const postSmokeRow = (raw: unknown, current: PostSmoke, field: keyof PostSmoke) =>
  reviewRows('postSmoke', raw, current, SATURDAY).find(row => row.field === field);

describe('rest time', () => {
  it.each([
    ['an hour and fifteen', 75, '01:15'],
    ['the shortest rest', 1, '00:01'],
    ['the longest rest', 24 * 60, '24:00'],
  ])('writes %s as the screen writes it', (_rule, restMinutes, restTime) => {
    const row = postSmokeRow({ restMinutes }, emptyPostSmoke({ restTime: '00:30' }), 'restTime');

    expect(row).toMatchObject({ oldValue: '00:30', newValue: restTime });
  });

  it.each([
    ['no rest at all', 0, 'Rest time: 0 minutes.'],
    ['a rest longer than a day', 24 * 60 + 1, 'Rest time: 1441 minutes.'],
    ['a rest that is not a number of minutes', 'a while', 'Rest time: a while.'],
  ])('fills nothing for %s and keeps it for Notes', (_rule, restMinutes, leftover) => {
    const current = emptyPostSmoke({ restTime: '00:30' });

    expect(postSmokeRow({ restMinutes }, current, 'restTime')).toBeUndefined();
    expect(postSmokeRow({ restMinutes }, current, 'notes')).toMatchObject({ newValue: leftover });
  });

  it('adds the post-smoke steps the same way the prep steps are added', () => {
    const row = postSmokeRow(
      { steps: ['wrap in towels', 'Slice'] },
      emptyPostSmoke({ steps: ['Slice'] }),
      'steps'
    );

    expect(row).toMatchObject({ newValue: ['Slice', 'Wrap in towels'], added: ['Wrap in towels'] });
  });
});

describe('notes', () => {
  const words = (count: number): string =>
    Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' ');

  it('proposes no row when the Ramble leaves nothing over', () => {
    const current = emptyPreSmoke({ notes: 'Dry brined overnight.' });

    expect(preSmokeRow({ name: 'Sunday brisket' }, current, 'notes')).toBeUndefined();
  });

  it('replaces Notes at the word limit with the merged text the model wrote', () => {
    const current = emptyPreSmoke({ notes: words(150) });

    const row = preSmokeRow({ notes: 'Old and new, merged.' }, current, 'notes');

    expect(row).toMatchObject({ oldValue: words(150), newValue: 'Old and new, merged.' });
  });

  it('adds the summary as a paragraph after Notes over the word limit', () => {
    const current = emptyPreSmoke({ notes: words(151) });

    const row = preSmokeRow({ notes: 'Bark looked great.' }, current, 'notes');

    expect(row).toMatchObject({
      oldValue: words(151),
      newValue: `${words(151)}\n\nBark looked great.`,
    });
  });

  it('writes the summary into empty Notes', () => {
    const row = postSmokeRow({ notes: 'The point was jiggly.' }, emptyPostSmoke(), 'notes');

    expect(row).toMatchObject({ oldValue: '', newValue: 'The point was jiggly.' });
  });

  it('adds every rejected value to the merged text', () => {
    const current = emptyPreSmoke({ notes: 'Dry brined overnight.' });

    const row = preSmokeRow(
      { notes: 'Dry brined overnight, from the butcher.', weight: 250 },
      current,
      'notes'
    );

    expect(row).toMatchObject({ newValue: 'Dry brined overnight, from the butcher. Weight: 250.' });
  });

  it('adds every rejected value to the paragraph after long Notes', () => {
    const current = emptyPostSmoke({ notes: words(151) });

    const row = postSmokeRow(
      { notes: 'Rested in the cooler.', restMinutes: 3000 },
      current,
      'notes'
    );

    expect(row).toMatchObject({
      newValue: `${words(151)}\n\nRested in the cooler. Rest time: 3000 minutes.`,
    });
  });

  it('keeps short Notes the model wrote nothing for and adds the rejected value after them', () => {
    const current = emptyPreSmoke({ notes: 'Dry brined overnight.' });

    const row = preSmokeRow({ weight: '12 to 13' }, current, 'notes');

    expect(row).toMatchObject({ newValue: 'Dry brined overnight.\n\nWeight: 12 to 13.' });
  });

  it('proposes no row when the merged text is the Notes already there', () => {
    const current = emptyPreSmoke({ notes: 'Dry brined overnight.' });

    expect(preSmokeRow({ notes: 'Dry brined overnight.' }, current, 'notes')).toBeUndefined();
  });
});

describe('fill and Undo', () => {
  const current = emptyPreSmoke({
    name: 'Old name',
    meatType: 'Turkey',
    weight: { weight: 3, unit: WeightUnits.KG },
    steps: ['Trim'],
    notes: 'Dry brined overnight.',
  });
  const rows = reviewRows(
    'preSmoke',
    {
      name: 'Sunday brisket',
      meatType: 'brisket',
      weight: 12.5,
      weightUnit: 'LB',
      steps: ['Season'],
      notes: 'Dry brined overnight, from the butcher.',
    },
    current,
    SATURDAY
  );

  it('writes only the ticked rows', () => {
    expect(rows.map(row => row.id)).toEqual(['name', 'meatType', 'weight', 'steps', 'notes']);

    const { write } = fillFor(rows, ['name', 'steps']);

    expect(write).toEqual({ name: 'Sunday brisket', steps: ['Trim', 'Season'] });
  });

  it('returns an Undo that restores exactly what the ticked rows changed', () => {
    const { write, undo } = fillFor(rows, ['weight', 'notes']);

    expect(undo).toEqual({
      weight: { weight: 3, unit: WeightUnits.KG },
      notes: 'Dry brined overnight.',
    });
    expect({ ...current, ...write, ...undo }).toEqual(current);
  });

  it('writes nothing and undoes nothing when every row is unticked', () => {
    expect(fillFor(rows, [])).toEqual({ write: {}, undo: {} });
  });
});

describe('a raw object that is not what was asked for', () => {
  it.each([
    ['is not an object at all', 'brisket'],
    ['is a list', [{ name: 'Sunday brisket' }]],
    ['is nothing', null],
    [
      'answers every field with "not said"',
      { name: null, meatType: null, weight: null, weightUnit: null, steps: [], notes: null },
    ],
    ['answers with the wrong kinds of value', { name: 7, meatType: {}, steps: 'trim', notes: [] }],
  ])('proposes no rows when it %s', (_rule, raw) => {
    expect(reviewRows('preSmoke', raw, emptyPreSmoke(), SATURDAY)).toEqual([]);
  });

  it('proposes no post-smoke rows when every field is "not said"', () => {
    const raw = { restMinutes: null, steps: [], notes: null };

    expect(reviewRows('postSmoke', raw, emptyPostSmoke(), SATURDAY)).toEqual([]);
  });
});
