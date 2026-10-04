/**
 * Extraction contract table, smoke screen.
 *
 * Every rule about what a Ramble fills on the smoke screen — names, wood, the
 * probe targets, the Serve Plan and the cook log — driven through the
 * contract's public interface with no model in sight and a fixed clock.
 */
import { DEFAULT_STAMPS } from '../api/cookStamps';
import { PostSmoke, PreSmoke } from '../api/types';
import { WeightUnits } from '../components/common/interfaces/enums';
import { SmokeScreenValues, VoiceFillContext, fillFor, reviewRows } from '.';

// Saturday 3 October 2026, 3 in the afternoon, in whatever zone the suite runs
// in: a serve time is a time on the clock the cook's phone shows.
const at = (day: number, hour: number, minute = 0): Date => new Date(2026, 9, day, hour, minute);
const NOW = at(3, 15);

const context = (overrides: Partial<VoiceFillContext> = {}): VoiceFillContext => ({
  now: NOW,
  enabledStamps: DEFAULT_STAMPS,
  ...overrides,
});

type SmokeScreen = Omit<SmokeScreenValues, 'stamps'>;

const smokeScreen = (overrides: Partial<SmokeScreen> = {}): SmokeScreen => ({
  chamberName: '',
  probe1Name: '',
  probe2Name: '',
  probe3Name: '',
  woodType: '',
  notes: '',
  probe1Target: { target: 203, enabled: false, targetSource: 'default' },
  probe2Target: { target: 203, enabled: false, targetSource: 'default' },
  probe3Target: { target: 203, enabled: false, targetSource: 'default' },
  serveAt: null,
  restMinutes: null,
  ...overrides,
});

const smokeRows = (raw: unknown, current: SmokeScreen = smokeScreen(), given = context()) =>
  reviewRows('smoke', raw, current, given);

const smokeRow = (
  raw: unknown,
  field: keyof SmokeScreenValues,
  current: SmokeScreen = smokeScreen(),
  given = context()
) => smokeRows(raw, current, given).find(row => row.field === field);

describe('wood', () => {
  it.each([
    ['snaps a match in any case to the list spelling', 'post oak', 'Post Oak'],
    ['keeps a wood not on the list as spoken, first letter capitalised', 'grapevine', 'Grapevine'],
    ['does not snap a near miss', 'oak', 'Oak'],
  ])('%s', (_rule, spoken, expected) => {
    const row = smokeRow({ woodType: spoken }, 'woodType', smokeScreen({ woodType: 'Cherry' }));

    expect(row).toMatchObject({ label: 'Wood type', oldValue: 'Cherry', newValue: expected });
  });
});

describe('chamber and probe names', () => {
  it('names the chamber and each probe as spoken', () => {
    const raw = { chamberName: 'Pit', probe1Name: 'Flat', probe3Name: 'Point' };
    const current = smokeScreen({ probe1Name: 'Brisket' });

    expect(smokeRows(raw, current)).toMatchObject([
      { id: 'chamberName', label: 'Chamber name', oldValue: '', newValue: 'Pit' },
      { id: 'probe1Name', label: 'Probe 1 name', oldValue: 'Brisket', newValue: 'Flat' },
      { id: 'probe3Name', label: 'Probe 3 name', oldValue: '', newValue: 'Point' },
    ]);
  });

  it('proposes no row for a name the probe already has', () => {
    const current = smokeScreen({ probe2Name: 'Point' });

    expect(smokeRows({ probe2Name: ' Point ' }, current)).toEqual([]);
  });
});

const targets = (...spoken: [probe: string, target: unknown][]) => ({
  probeTargets: spoken.map(([probe, target]) => ({ probe, target })),
});

/** The fields of the probes a Ramble proposes a target for, in row order. */
const targeted = (raw: unknown, current: SmokeScreen = smokeScreen()) =>
  smokeRows(raw, current)
    .map(row => row.field)
    .filter(field => field.endsWith('Target'));

describe('probe targets', () => {
  it('sets a target, turns that probe’s watch on and marks the target user-set', () => {
    const row = smokeRow(targets(['probe one', 195]), 'probe1Target');

    expect(row).toEqual({
      id: 'probe1Target',
      field: 'probe1Target',
      label: 'Probe 1 target',
      oldValue: { target: 203, enabled: false, targetSource: 'default' },
      newValue: { target: 195, enabled: true, targetSource: 'user' },
    });
  });

  it('proposes one row per probe, in probe order, each with its own target', () => {
    const raw = targets(['probe three', 165], ['probe one', 203]);
    const current = smokeScreen({
      probe1Target: { target: 195, enabled: true, targetSource: 'preset' },
    });

    expect(smokeRows(raw, current)).toMatchObject([
      {
        id: 'probe1Target',
        oldValue: { target: 195, enabled: true, targetSource: 'preset' },
        newValue: { target: 203, enabled: true, targetSource: 'user' },
      },
      {
        id: 'probe3Target',
        label: 'Probe 3 target',
        oldValue: { target: 203, enabled: false, targetSource: 'default' },
        newValue: { target: 165, enabled: true, targetSource: 'user' },
      },
    ]);
  });

  it.each([
    ['the lowest target', 32, 32],
    ['the highest target', 500, 500],
    ['a target the model wrote as text', '195', 195],
  ])('takes %s', (_rule, spoken, target) => {
    expect(smokeRow(targets(['probe two', spoken]), 'probe2Target')).toMatchObject({
      newValue: { target, enabled: true, targetSource: 'user' },
    });
  });

  it.each([
    ['a target below freezing', 31, 'Probe target: probe two 31.'],
    ['a target over the upper bound', 501, 'Probe target: probe two 501.'],
    ['a misheard target', 2003, 'Probe target: probe two 2003.'],
    ['a target under the bound that would round up to it', 31.6, 'Probe target: probe two 31.6.'],
    ['a target that is not a number', 'hot', 'Probe target: probe two hot.'],
    ['a part of a degree, never rounded to a whole one', 194.6, 'Probe target: probe two 194.6.'],
    ['a part of a degree the model wrote as text', '194.6', 'Probe target: probe two 194.6.'],
  ])('sets nothing for %s and keeps it for Notes', (_rule, spoken, leftover) => {
    const raw = targets(['probe two', spoken]);

    expect(targeted(raw)).toEqual([]);
    expect(smokeRow(raw, 'notes')).toMatchObject({ newValue: leftover });
  });

  it('sets nothing for a probe given two targets and keeps both for Notes', () => {
    const raw = targets(['probe one', 195], ['all', 203]);

    expect(targeted(raw)).toEqual(['probe2Target', 'probe3Target']);
    expect(smokeRow(raw, 'notes')).toMatchObject({ newValue: 'Probe target: probe 1 195 or 203.' });
  });

  it('proposes no row for a target the probe already has, watched and user-set', () => {
    const current = smokeScreen({
      probe1Target: { target: 195, enabled: true, targetSource: 'user' },
    });

    expect(smokeRows(targets(['probe one', 195], ['probe 1', 195]), current)).toEqual([]);
  });

  it('proposes a row for a target the probe already has when it was not being watched', () => {
    const current = smokeScreen({
      probe1Target: { target: 195, enabled: false, targetSource: 'user' },
    });

    expect(smokeRow(targets(['probe one', 195]), 'probe1Target', current)).toMatchObject({
      oldValue: { target: 195, enabled: false, targetSource: 'user' },
      newValue: { target: 195, enabled: true, targetSource: 'user' },
    });
  });

  describe('matching a spoken probe', () => {
    const named = smokeScreen({ probe1Name: 'Flat', probe2Name: 'Point', probe3Name: 'Probe 1' });

    it.each([
      ['probe two', 'probe2Target'],
      ['Probe 3', 'probe3Target'],
      ['the second probe', 'probe2Target'],
      ['number three', 'probe3Target'],
      ['2', 'probe2Target'],
    ])('takes "%s" by its number', (probe, field) => {
      expect(targeted(targets([probe, 195]))).toEqual([field]);
    });

    it('lets a spoken number win over a probe that carries that number as its name', () => {
      expect(targeted(targets(['probe 1', 195]), named)).toEqual(['probe1Target']);
    });

    it.each([
      ['the flat', 'probe1Target'],
      ['POINT', 'probe2Target'],
      ['the point.', 'probe2Target'],
      ['the flat probe', 'probe1Target'],
      ['flat probe', 'probe1Target'],
      ['The Point probe.', 'probe2Target'],
    ])('takes "%s" by the name its probe has', (probe, field) => {
      expect(targeted(targets([probe, 195]), named)).toEqual([field]);
    });

    it('takes a probe whose own name ends in "probe" by that name, said with or without it', () => {
      const current = smokeScreen({ probe1Name: 'Probe', probe2Name: 'Rib probe' });

      expect(targeted(targets(['the probe', 195]), current)).toEqual(['probe1Target']);
      expect(targeted(targets(['the rib', 195]), current)).toEqual(['probe2Target']);
      expect(targeted(targets(['rib probe', 195]), current)).toEqual(['probe2Target']);
    });

    it('takes a probe by the name this Ramble gives it', () => {
      const raw = { probe1Name: 'Point', probe2Name: 'Flat', ...targets(['the flat', 195]) };

      expect(targeted(raw, named)).toEqual(['probe2Target']);
    });

    it('takes a probe by the current name the context gives it', () => {
      const given = context({ probeNames: ['Flat', 'Point', ''] });

      expect(smokeRows(targets(['the point', 195]), smokeScreen(), given)).toMatchObject([
        { id: 'probe2Target', newValue: { target: 195, enabled: true, targetSource: 'user' } },
      ]);
    });

    it('reads the current names from the context, where it carries them, not the screen', () => {
      const given = context({ probeNames: ['Point', 'Flat', ''] });

      expect(smokeRows(targets(['the flat', 195]), named, given)).toMatchObject([
        { id: 'probe2Target' },
      ]);
      expect(smokeRows(targets(['probe 1', 195]), named, given)).toMatchObject([
        { id: 'probe1Target' },
      ]);
    });

    it('lets a name this Ramble gives a probe win over the context’s name for it', () => {
      const given = context({ probeNames: ['Flat', 'Point', ''] });
      const raw = { probe3Name: 'Flat', probe1Name: 'Ribs', ...targets(['the flat', 195]) };

      expect(
        smokeRows(raw, smokeScreen(), given)
          .map(row => row.field)
          .filter(field => field.endsWith('Target'))
      ).toEqual(['probe3Target']);
    });

    it.each([
      'both',
      'all',
      'All probes',
      'both of them',
      'every probe',
      'each probe',
      'all three',
      'all of the probes',
      'all three probes.',
    ])('takes "%s" as every probe this Ramble names', probe => {
      const raw = { probe1Name: 'Flat', probe3Name: 'Point', ...targets([probe, 195]) };

      expect(targeted(raw, named)).toEqual(['probe1Target', 'probe3Target']);
    });

    it('counts a probe as named by this Ramble even when it already had that name', () => {
      const raw = { probe1Name: 'Flat', probe2Name: 'Point', ...targets(['both', 195]) };

      expect(targeted(raw, named)).toEqual(['probe1Target', 'probe2Target']);
    });

    it.each(['both', 'all'])('takes "%s" as all three when this Ramble names none', probe => {
      expect(targeted(targets([probe, 195]), named)).toEqual([
        'probe1Target',
        'probe2Target',
        'probe3Target',
      ]);
    });

    it.each([
      ['a name no probe has', targets(['the ribs', 195]), 'Probe target: the ribs 195.'],
      ['a number no probe has', targets(['probe four', 195]), 'Probe target: probe four 195.'],
      ['no probe at all', targets(['', 195]), 'Probe target: 195.'],
      [
        'a name that only opens with "all"',
        targets(['all beef ribs', 195]),
        'Probe target: all beef ribs 195.',
      ],
      [
        'a name that only opens with "both"',
        targets(['both briskets', 195]),
        'Probe target: both briskets 195.',
      ],
      [
        'a name two probes share',
        { probe1Name: 'Point', ...targets(['the point', 195]) },
        'Probe target: the point 195.',
      ],
    ])('sets nothing for %s and keeps it for Notes', (_rule, raw, leftover) => {
      expect(targeted(raw, named)).toEqual([]);
      expect(smokeRow(raw, 'notes', named)).toMatchObject({ oldValue: '', newValue: leftover });
    });
  });
});

describe('rest duration', () => {
  it.each([
    ['forty-five minutes', 45, 45],
    ['the shortest rest', 1, 1],
    ['the longest rest', 24 * 60, 1440],
    ['minutes the model wrote as text', '75', 75],
    ['a part of a minute, to the nearest whole one', 89.6, 90],
    ['"a couple hours"', 'a couple hours', 120],
    ['"a couple of hours"', 'A couple of hours.', 120],
    ['"half an hour"', 'half an hour', 30],
  ])('takes %s as minutes', (_rule, spoken, minutes) => {
    const row = smokeRow({ restMinutes: spoken }, 'restMinutes', smokeScreen({ restMinutes: 60 }));

    expect(row).toMatchObject({
      id: 'restMinutes',
      label: 'Rest duration',
      oldValue: 60,
      newValue: minutes,
    });
  });

  it.each([
    ['"a few hours"', 'a few hours', 'Rest duration: a few hours.'],
    ['"a while"', 'a while', 'Rest duration: a while.'],
    ['no rest at all', 0, 'Rest duration: 0 minutes.'],
    ['a rest longer than a day', 24 * 60 + 1, 'Rest duration: 1441 minutes.'],
    ['a rest under a minute that would round up to one', 0.5, 'Rest duration: 0.5 minutes.'],
  ])('fills nothing for %s and keeps it for Notes', (_rule, spoken, leftover) => {
    const raw = { restMinutes: spoken };

    expect(smokeRow(raw, 'restMinutes')).toBeUndefined();
    expect(smokeRow(raw, 'notes')).toMatchObject({ newValue: leftover });
  });

  it('fills a cook that had no rest, and proposes no row for the rest it already has', () => {
    expect(smokeRow({ restMinutes: 45 }, 'restMinutes')).toMatchObject({
      oldValue: null,
      newValue: 45,
    });
    expect(smokeRows({ restMinutes: 45 }, smokeScreen({ restMinutes: 45 }))).toEqual([]);
  });
});

describe('serve time', () => {
  const serveAt = (raw: unknown, now = NOW) =>
    smokeRow(raw, 'serveAt', smokeScreen(), context({ now }))?.newValue;

  it('proposes a row that turns the clock time said into a date', () => {
    expect(smokeRow({ serveClock: '6:30 PM' }, 'serveAt')).toEqual({
      id: 'serveAt',
      field: 'serveAt',
      label: 'Serve time',
      oldValue: null,
      newValue: at(3, 18, 30),
    });
  });

  it.each([
    ['an afternoon time still to come today', '6:30 pm', at(3, 18, 30)],
    ['a morning time already gone today, tomorrow', '6:30 AM', at(4, 6, 30)],
    ['an afternoon time already gone today, tomorrow', '2 p.m.', at(4, 14)],
    ['the very minute it is now, tomorrow', '3:00 PM', at(4, 15)],
    ['a time on the 24-hour clock', '18:30', at(3, 18, 30)],
    ['a bare hour', '6pm', at(3, 18)],
    ['midnight', '12:00 AM', at(4, 0)],
    ['just after noon', '12:15 PM', at(4, 12, 15)],
  ])('takes %s when AM or PM was said', (_rule, serveClock, expected) => {
    expect(serveAt({ serveClock })).toEqual(expected);
  });

  it.each([
    ['the evening one when the morning one has gone', at(3, 15), at(3, 18, 30)],
    ['the evening one when both are still to come', at(3, 5), at(3, 18, 30)],
    ['the next morning one when both have gone', at(3, 20), at(4, 6, 30)],
    ['the evening one a minute before it', at(3, 18, 29), at(3, 18, 30)],
    ['the next morning one once the evening one is here', at(3, 18, 30), at(4, 6, 30)],
  ])('takes the next occurrence with no AM or PM said: %s', (_rule, now, expected) => {
    expect(serveAt({ serveClock: '6:30' }, now)).toEqual(expected);
  });

  it.each([
    ['the evening with no AM or PM said', '6', at(4, 18)],
    ['the morning when AM was said', '6 AM', at(4, 6)],
    ['a time later today on the clock, tomorrow all the same', '18:00', at(4, 18)],
    ['a time already gone today', '2:15 PM', at(4, 14, 15)],
  ])('takes a time said to be tomorrow on that day: %s', (_rule, serveClock, expected) => {
    expect(serveAt({ serveClock, serveTomorrow: true })).toEqual(expected);
  });

  it('puts a clock time on the minute however far into a minute the Ramble was spoken', () => {
    const now = new Date(2026, 9, 3, 15, 0, 23, 457);

    expect(serveAt({ serveClock: '6:30' }, now)).toEqual(at(3, 18, 30));
    expect(serveAt({ serveInMinutes: 7 }, now)).toEqual(new Date(2026, 9, 3, 15, 7, 23, 457));
  });

  it('takes a time not said to be tomorrow as its next occurrence', () => {
    expect(serveAt({ serveClock: '6', serveTomorrow: false })).toEqual(at(3, 18));
  });

  it.each([
    ['"in four hours"', 240, at(3, 19)],
    ['an offset the model wrote as text', '90', at(3, 16, 30)],
    ['the shortest offset', 1, at(3, 15, 1)],
    ['an offset of exactly 48 hours', 48 * 60, at(5, 15)],
  ])('takes %s from the time of the Ramble', (_rule, serveInMinutes, expected) => {
    expect(serveAt({ serveInMinutes })).toEqual(expected);
  });

  it.each([
    ['a time that is no clock time', { serveClock: 'dinner time' }, 'Serve time: dinner time.'],
    ['a day with no time', { serveClock: 'Saturday' }, 'Serve time: Saturday.'],
    ['an hour no clock has', { serveClock: '25:00' }, 'Serve time: 25:00.'],
    ['a minute no clock has', { serveClock: '6:75' }, 'Serve time: 6:75.'],
    ['an afternoon hour said with PM', { serveClock: '13 PM' }, 'Serve time: 13 PM.'],
    [
      'a time that is no clock time, tomorrow',
      { serveClock: 'lunch', serveTomorrow: true },
      'Serve time: lunch tomorrow.',
    ],
    ['tomorrow with no time', { serveTomorrow: true }, 'Serve time: tomorrow.'],
    [
      'an offset past the next 48 hours',
      { serveInMinutes: 48 * 60 + 1 },
      'Serve time: in 2881 minutes.',
    ],
    ['an offset of nothing', { serveInMinutes: 0 }, 'Serve time: in 0 minutes.'],
    ['an offset into the past', { serveInMinutes: -30 }, 'Serve time: in -30 minutes.'],
    ['an offset that is no number', { serveInMinutes: 'a bit' }, 'Serve time: in a bit.'],
    [
      'a clock time and an offset at once',
      { serveClock: '6:30', serveInMinutes: 240 },
      'Serve time: 6:30 or in 240 minutes.',
    ],
  ])('sets nothing for %s and keeps it for Notes', (_rule, raw, leftover) => {
    expect(smokeRow(raw, 'serveAt')).toBeUndefined();
    expect(smokeRow(raw, 'notes')).toMatchObject({ newValue: leftover });
  });

  it('proposes no row for the serve time the plan already has', () => {
    const current = smokeScreen({ serveAt: at(3, 18, 30) });

    expect(smokeRows({ serveClock: '6:30' }, current)).toEqual([]);
  });

  it('proposes no row and no Notes when no serve time was said', () => {
    expect(smokeRows({ serveClock: null, serveTomorrow: false, serveInMinutes: null })).toEqual([]);
  });
});

describe('cook log stamps', () => {
  const just = (...stamps: string[]) => ({ stamps: stamps.map(stamp => ({ stamp })) });

  it('proposes one "Log now" row for everything just done, stamped at the time of the Ramble', () => {
    expect(smokeRows(just('wrap', 'spritz'))).toEqual([
      {
        id: 'stamps',
        field: 'stamps',
        label: 'Log now',
        oldValue: [],
        newValue: [
          { stampKey: 'wrap', label: 'Wrapped', at: NOW },
          { stampKey: 'spritz', label: 'Spritzed', at: NOW },
        ],
      },
    ]);
  });

  it('logs a stamp said twice in one Ramble once', () => {
    expect(smokeRow(just('wrap', 'Wrap'), 'stamps')?.newValue).toEqual([
      { stampKey: 'wrap', label: 'Wrapped', at: NOW },
    ]);
  });

  it('takes a stamp by what its button says, as well as by its key', () => {
    const custom = {
      key: 'custom-01JABCDEFGHJKMNPQRSTVWXYZ0',
      label: 'Flipped',
      tone: 'amber' as const,
      enabled: true,
      custom: true,
    };
    const given = context({ enabledStamps: [...DEFAULT_STAMPS, custom] });

    expect(smokeRow(just('flipped', 'Added wood.'), 'stamps', smokeScreen(), given)).toMatchObject({
      newValue: [
        { stampKey: custom.key, label: 'Flipped', at: NOW },
        { stampKey: 'wood', label: 'Added Wood', at: NOW },
      ],
    });
    expect(smokeRow(just(custom.key), 'stamps', smokeScreen(), given)).toMatchObject({
      newValue: [{ stampKey: custom.key, label: 'Flipped', at: NOW }],
    });
  });

  it.each([
    [
      'a stamp that is switched off',
      context({
        enabledStamps: DEFAULT_STAMPS.map(stamp => ({ ...stamp, enabled: stamp.key !== 'vent' })),
      }),
    ],
    [
      'a stamp the cook log does not offer',
      context({ enabledStamps: DEFAULT_STAMPS.filter(stamp => stamp.key !== 'vent') }),
    ],
    ['any stamp when the cook log offers none', context({ enabledStamps: undefined })],
  ])('logs nothing for %s and keeps it for Notes', (_rule, given) => {
    expect(smokeRows(just('vent'), smokeScreen(), given)).toMatchObject([
      { id: 'notes', newValue: 'Log now: vent.' },
    ]);
  });

  it('does not backdate something done a while ago: it goes to Notes as it was said', () => {
    const raw = { stamps: [{ stamp: 'wrap', ago: 'an hour ago' }] };

    expect(smokeRows(raw)).toMatchObject([
      { id: 'notes', newValue: 'Log now: Wrapped an hour ago.' },
    ]);
  });

  it.each(['just now', 'Just now.', 'right now', 'now', 'just'])(
    'logs something said to have been done "%s"',
    ago => {
      expect(smokeRows({ stamps: [{ stamp: 'wrap', ago }] })).toMatchObject([
        { id: 'stamps', newValue: [{ stampKey: 'wrap', label: 'Wrapped', at: NOW }] },
      ]);
    }
  );

  it.each([
    ['a number', 60, 'Log now: Wrapped 60.'],
    ['a number of nothing', 0, 'Log now: Wrapped 0.'],
    ['a number the model wrote as text', '60', 'Log now: Wrapped 60.'],
  ])('does not backdate an offset the model wrote as %s', (_rule, ago, leftover) => {
    expect(smokeRows({ stamps: [{ stamp: 'wrap', ago }] })).toMatchObject([
      { id: 'notes', newValue: leftover },
    ]);
  });

  it('logs what was just done and keeps what was done earlier for Notes', () => {
    const raw = {
      stamps: [
        { stamp: 'wrap', ago: '20 minutes ago' },
        { stamp: 'spritz', ago: null },
        { stamp: 'lid', ago: '' },
      ],
    };

    expect(smokeRows(raw)).toMatchObject([
      {
        id: 'stamps',
        newValue: [
          { stampKey: 'spritz', label: 'Spritzed', at: NOW },
          { stampKey: 'lid', label: 'Lid Open', at: NOW },
        ],
      },
      { id: 'notes', newValue: 'Log now: Wrapped 20 minutes ago.' },
    ]);
  });
});

describe('notes', () => {
  it('writes what the model summarised, content for another screen included', () => {
    const raw = { notes: 'The brisket is twelve pounds. Stall hit around 160.' };
    const current = smokeScreen({ notes: 'Stall hit around 160.' });

    expect(smokeRows(raw, current)).toEqual([
      {
        id: 'notes',
        field: 'notes',
        label: 'Notes',
        oldValue: 'Stall hit around 160.',
        newValue: 'The brisket is twelve pounds. Stall hit around 160.',
      },
    ]);
  });

  it('adds every rejected value to what the model summarised', () => {
    const raw = {
      notes: 'Stall hit around 160.',
      ...targets(['probe one', 2003]),
      serveClock: 'dinner time',
      restMinutes: 'a while',
      stamps: [{ stamp: 'wrap', ago: 'an hour ago' }],
    };

    expect(smokeRows(raw)).toMatchObject([
      {
        id: 'notes',
        newValue:
          'Stall hit around 160. Probe target: probe one 2003. Serve time: dinner time. ' +
          'Rest duration: a while. Log now: Wrapped an hour ago.',
      },
    ]);
  });
});

describe('a value that belongs to another screen', () => {
  it('fills nothing on the smoke screen and is kept in its Notes', () => {
    const raw = {
      name: 'Sunday brisket',
      meatType: 'brisket',
      weight: 12.5,
      weightUnit: 'LB',
      steps: ['Trim the fat cap', 'Season'],
    };

    expect(smokeRows(raw)).toMatchObject([
      {
        id: 'notes',
        newValue:
          'Name: Sunday brisket. Meat type: brisket. Weight: 12.5. Unit: LB. ' +
          'Prep steps: Trim the fat cap, Season.',
      },
    ]);
  });

  it('fills nothing on the pre-smoke screen and is kept in its Notes', () => {
    const current: PreSmoke = { weight: { unit: WeightUnits.LB }, steps: [''], notes: '' };
    const raw = {
      probe1Name: 'Flat',
      woodType: 'hickory',
      ...targets(['the flat', 203]),
      serveClock: '6:30',
      serveTomorrow: true,
      restMinutes: 45,
      stamps: [{ stamp: 'wrap', ago: null }],
    };

    expect(reviewRows('preSmoke', raw, current, context())).toMatchObject([
      {
        id: 'notes',
        newValue:
          'Probe 1 name: Flat. Wood type: hickory. Probe target: the flat 203. ' +
          'Serve time: 6:30. Rest duration: 45. Log now: wrap.',
      },
    ]);
  });

  it('is kept in the post-smoke screen’s Notes, less what that screen has a field for', () => {
    const current: PostSmoke = { restTime: '', steps: [''], notes: '' };
    const raw = { woodType: 'hickory', restMinutes: 45, steps: ['Slice'] };

    expect(reviewRows('postSmoke', raw, current, context())).toMatchObject([
      { id: 'restTime', newValue: '00:45' },
      { id: 'steps', added: ['Slice'] },
      { id: 'notes', newValue: 'Wood type: hickory.' },
    ]);
  });

  it('is not kept when nothing was said for it, or when no screen has a field for it', () => {
    const raw = { meatType: null, weight: null, steps: [], name: ' ', transcript: 'um', when: {} };

    expect(smokeRows(raw)).toEqual([]);
  });
});

describe('fill and Undo', () => {
  const current = smokeScreen({
    probe1Name: 'Brisket',
    woodType: 'Cherry',
    notes: 'Stall hit around 160.',
    probe1Target: { target: 195, enabled: false, targetSource: 'preset' },
    probe2Target: { target: 203, enabled: true, targetSource: 'default' },
    serveAt: at(3, 19),
    restMinutes: 60,
  });
  const rows = smokeRows(
    {
      probe1Name: 'Flat',
      woodType: 'post oak',
      ...targets(['both', 203]),
      serveClock: '6:30',
      restMinutes: 45,
      stamps: [{ stamp: 'wrap' }],
      notes: 'Stall hit around 160. Bark is setting.',
    },
    current
  );

  it('proposes the rows in the order the screen lays its fields out', () => {
    expect(rows.map(row => row.id)).toEqual([
      'probe1Name',
      'woodType',
      'probe1Target',
      'serveAt',
      'restMinutes',
      'stamps',
      'notes',
    ]);
  });

  it('writes only the ticked rows', () => {
    expect(fillFor(rows, ['probe1Target', 'serveAt', 'stamps']).write).toEqual({
      probe1Target: { target: 203, enabled: true, targetSource: 'user' },
      serveAt: at(3, 18, 30),
      stamps: [{ stampKey: 'wrap', label: 'Wrapped', at: NOW }],
    });
  });

  it('returns an Undo that restores each probe’s previous target, watch switch and source', () => {
    const all = smokeRows(targets(['all', 165]), current);

    expect(fillFor(all, ['probe1Target', 'probe2Target']).undo).toEqual({
      probe1Target: { target: 195, enabled: false, targetSource: 'preset' },
      probe2Target: { target: 203, enabled: true, targetSource: 'default' },
    });
  });

  it('returns an Undo that restores everything the Ramble changed on the screen', () => {
    const { write, undo } = fillFor(
      rows,
      rows.map(row => row.id)
    );

    expect(undo).toEqual({
      probe1Name: 'Brisket',
      woodType: 'Cherry',
      probe1Target: { target: 195, enabled: false, targetSource: 'preset' },
      serveAt: at(3, 19),
      restMinutes: 60,
      stamps: [],
      notes: 'Stall hit around 160.',
    });
    expect({ ...current, ...write, ...undo }).toEqual({ ...current, stamps: [] });
  });
});

describe('a raw object that is not what was asked for', () => {
  it.each([
    ['is not an object at all', 'probe one to 203'],
    ['is nothing', null],
    [
      'answers every field with "not said"',
      {
        chamberName: null,
        probe1Name: null,
        probe2Name: null,
        probe3Name: null,
        woodType: null,
        probeTargets: [],
        serveClock: null,
        serveTomorrow: null,
        serveInMinutes: null,
        restMinutes: null,
        stamps: [],
        notes: null,
      },
    ],
    [
      'answers with the wrong kinds of value',
      {
        chamberName: 7,
        woodType: ['hickory'],
        probeTargets: 'probe one to 203',
        serveClock: 630,
        serveTomorrow: 'yes',
        restMinutes: {},
        stamps: ['wrap', 7, null],
        notes: {},
      },
    ],
    [
      'lists entries that say nothing',
      { probeTargets: [{ probe: 'probe one', target: null }, {}], stamps: [{ ago: 'earlier' }] },
    ],
  ])('proposes no rows when it %s', (_rule, raw) => {
    expect(smokeRows(raw)).toEqual([]);
  });
});
