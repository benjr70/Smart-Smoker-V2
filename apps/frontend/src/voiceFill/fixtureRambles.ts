/**
 * The fixture Rambles: the nine scripts read aloud for the real-phone bar,
 * three per screen, each with the values its screen holds beforehand and the
 * fields it is expected to fill.
 *
 * A real-phone run reads each script to the real app on the phone and compares
 * the review list with `expected`. `ideal` is the raw object a model that heard
 * the script perfectly would return; the test beside this file puts it through
 * the extraction contract and holds `expected` to what comes out, so the sheet
 * a tester marks against can never ask for something the contract would not
 * fill.
 *
 * The same scripts are written out for the tester in `fixtureRambles.md`.
 */
import { DEFAULT_STAMPS } from '../api/cookStamps';
import type { PostSmoke, PreSmoke } from '../api/types';
import { WeightUnits } from '../components/common/interfaces/enums';
import type { SmokeScreenCurrent, VoiceFillProbeTarget } from './extractionContract';
import type { VoiceFillContext } from './fieldDefinition';

/**
 * When the fixtures are read, as far as `expected` goes: Saturday 3 October
 * 2026, 3 in the afternoon. On the phone the day and the hour are the phone's
 * own, so a built name carries that day's weekday and a serve time that day's
 * date.
 */
export const FIXTURE_NOW = new Date(2026, 9, 3, 15, 0);

interface FixtureBase {
  /** What the run sheet and the results table call it. */
  id: string;
  /** The rules of the contract this Ramble is there to exercise. */
  covers: string;
  /** What is read aloud, word for word. */
  script: string;
  /** What a model that heard the script perfectly returns. */
  ideal: Record<string, unknown>;
  /**
   * Every structured field the review list is to propose, by the id of its
   * row, with the value it would write — and no other row but Notes.
   */
  expected: Record<string, unknown>;
  /** What Notes are to say, for the tester to judge; `null` where no Notes row is due. */
  notes: string | null;
  /** What the Ramble is read against beside the screen's values. */
  context: VoiceFillContext;
}

export type FixtureRamble =
  | (FixtureBase & { screen: 'preSmoke'; before: PreSmoke })
  | (FixtureBase & { screen: 'smoke'; before: SmokeScreenCurrent })
  | (FixtureBase & { screen: 'postSmoke'; before: PostSmoke });

const CONTEXT: VoiceFillContext = { now: FIXTURE_NOW };

/** A probe nobody has set a target for. */
const UNSET: VoiceFillProbeTarget = { target: 203, enabled: false, targetSource: 'default' };

/** A target the cook set, by voice or by hand. */
const set = (target: number): VoiceFillProbeTarget => ({
  target,
  enabled: true,
  targetSource: 'user',
});

const BLANK_SMOKE: SmokeScreenCurrent = {
  chamberName: '',
  probe1Name: '',
  probe2Name: '',
  probe3Name: '',
  woodType: '',
  notes: '',
  probe1Target: UNSET,
  probe2Target: UNSET,
  probe3Target: UNSET,
  serveAt: null,
  restMinutes: null,
};

/** The smoke screen as `smoke-1` leaves it: the two probes named and set. */
const NAMED_SMOKE: SmokeScreenCurrent = {
  ...BLANK_SMOKE,
  chamberName: 'Pit',
  probe1Name: 'Flat',
  probe2Name: 'Point',
  woodType: 'Post Oak',
  probe1Target: set(203),
  probe2Target: set(203),
};

const SMOKE_CONTEXT = (before: SmokeScreenCurrent): VoiceFillContext => ({
  now: FIXTURE_NOW,
  probeNames: [before.probe1Name, before.probe2Name, before.probe3Name],
  enabledStamps: DEFAULT_STAMPS,
  servePlanOffered: true,
});

/**
 * The Notes `post-3` is read onto: long enough that merging them is real work
 * for the model, short enough that they are merged and not appended to.
 */
export const LONG_SHORT_NOTES =
  'Fourteen pound prime brisket from Costco, trimmed down to about twelve. Went on at 6:15 AM ' +
  'with the pit at 250. Post oak the whole way with two chunks of cherry in the first hour. ' +
  'Stall started around 160 at about 11 AM and lasted nearly three hours. Wrapped in butcher ' +
  'paper at 172 with a little tallow. Bumped the pit to 275 after the wrap. The flat probed ' +
  'tender at 201 and the point at 205. Pulled it at 5:40 PM. Spritzed with apple cider ' +
  'vinegar every 45 minutes before the wrap. Bark set well but the bottom edge near the ' +
  'firebox got a bit dark.';

const RIBS_NOTES = 'Two racks of St. Louis cut from the butcher on Main Street.';

export const FIXTURE_RAMBLES: readonly FixtureRamble[] = [
  {
    id: 'pre-1',
    screen: 'preSmoke',
    covers: 'An empty screen: a listed cut, a spoken weight and unit, steps, and a built name.',
    before: { name: '', meatType: '', weight: { unit: WeightUnits.LB }, steps: [''], notes: '' },
    script:
      "I'm doing a brisket today, twelve and a half pounds. I trimmed the fat cap down to a " +
      "quarter inch, then rubbed it with salt and pepper. It's a prime packer from Costco.",
    ideal: {
      meatType: 'brisket',
      weight: 12.5,
      weightUnit: 'LB',
      steps: ['Trim the fat cap to a quarter inch', 'Rub with salt and pepper'],
      notes: 'Prime packer from Costco.',
    },
    expected: {
      name: 'Saturday Brisket',
      meatType: 'Brisket',
      weight: { weight: 12.5, unit: WeightUnits.LB },
      steps: ['Trim the fat cap to a quarter inch', 'Rub with salt and pepper'],
    },
    notes: 'That it is a prime packer from Costco.',
    context: CONTEXT,
  },
  {
    id: 'pre-2',
    screen: 'preSmoke',
    covers: 'Values already on screen replaced: a spoken name, a cut nobody listed, and kilograms.',
    before: {
      name: '',
      meatType: 'Chicken',
      weight: { weight: 5, unit: WeightUnits.LB },
      steps: [''],
      notes: '',
    },
    script:
      "Call this one Belly Burnt Ends. It's a pork belly, two and a half kilos. I scored the " +
      'skin, cut it into inch and a half cubes, and tossed them in the sweet rub. The fridge ' +
      "was running warm overnight so I'm keeping an eye on it.",
    ideal: {
      name: 'Belly Burnt Ends',
      meatType: 'pork belly',
      weight: 2.5,
      weightUnit: 'KG',
      steps: ['Score the skin', 'Cut into inch and a half cubes', 'Toss in the sweet rub'],
      notes: 'The fridge was running warm overnight, so it is being watched.',
    },
    expected: {
      name: 'Belly Burnt Ends',
      meatType: 'Pork belly',
      weight: { weight: 2.5, unit: WeightUnits.KG },
      steps: ['Score the skin', 'Cut into inch and a half cubes', 'Toss in the sweet rub'],
    },
    notes: 'That the fridge ran warm overnight and the meat is being watched.',
    context: CONTEXT,
  },
  {
    id: 'pre-3',
    screen: 'preSmoke',
    covers:
      'A weight given as a range goes to Notes and fills nothing; steps are added after the ' +
      'ones there; short existing Notes are merged; a name and a cut already there are left alone.',
    before: {
      name: 'Ribs for the neighbours',
      meatType: 'Ribs',
      weight: { unit: WeightUnits.LB },
      steps: ['Remove the membrane'],
      notes: RIBS_NOTES,
    },
    script:
      'These are somewhere between five and six pounds all together. I put on yellow mustard ' +
      'as a binder, then the sweet rub. One rack is a lot thinner than the other so it may ' +
      'finish early.',
    ideal: {
      steps: ['Put on yellow mustard as a binder', 'Apply the sweet rub'],
      notes:
        'Two racks of St. Louis cut from the butcher on Main Street, between five and six ' +
        'pounds all together. One rack is a lot thinner than the other, so it may finish early.',
    },
    expected: {
      steps: ['Remove the membrane', 'Put on yellow mustard as a binder', 'Apply the sweet rub'],
    },
    notes:
      'One text holding the old Notes (two racks, St. Louis cut, the butcher on Main Street) ' +
      'with the five-to-six pounds and the thinner rack that may finish early.',
    context: CONTEXT,
  },
  {
    id: 'smoke-1',
    screen: 'smoke',
    covers:
      'An empty screen: a listed wood of two words, the chamber and two probes named, and ' +
      'one target said of both.',
    before: BLANK_SMOKE,
    script:
      "I'm running post oak today. Call the chamber Pit. Probe one is in the flat and probe " +
      'two is in the point. Set them both to two oh three.',
    ideal: {
      chamberName: 'Pit',
      probe1Name: 'Flat',
      probe2Name: 'Point',
      woodType: 'post oak',
      probeTargets: [
        { probe: 'probe one', target: 203 },
        { probe: 'probe two', target: 203 },
      ],
    },
    expected: {
      chamberName: 'Pit',
      probe1Name: 'Flat',
      probe2Name: 'Point',
      woodType: 'Post Oak',
      probe1Target: set(203),
      probe2Target: set(203),
    },
    notes: null,
    context: SMOKE_CONTEXT(BLANK_SMOKE),
  },
  {
    id: 'smoke-2',
    screen: 'smoke',
    covers:
      'A probe picked by the name it already has, a serve time on the clock, a rest, and a ' +
      'stamp for something just done.',
    before: NAMED_SMOKE,
    script:
      "I'm switching over to cherry. Take the point to one ninety five. We're eating at six " +
      'thirty tonight and I want a forty five minute rest. I just spritzed it.',
    ideal: {
      woodType: 'cherry',
      probeTargets: [{ probe: 'the point', target: 195 }],
      serveClock: '6:30 PM',
      restMinutes: 45,
      stamps: [{ stamp: 'spritz' }],
    },
    expected: {
      woodType: 'Cherry',
      probe2Target: set(195),
      serveAt: new Date(2026, 9, 3, 18, 30),
      restMinutes: 45,
      stamps: [{ stampKey: 'spritz', label: 'Spritzed', at: FIXTURE_NOW }],
    },
    notes: null,
    context: SMOKE_CONTEXT(NAMED_SMOKE),
  },
  {
    id: 'smoke-3',
    screen: 'smoke',
    covers:
      'A third probe named and set in one breath, a serve time as a length of time, one ' +
      'stamp logged and one done a while ago kept in Notes, and an observation.',
    before: NAMED_SMOKE,
    script:
      'Probe three is in the pork butt, take it to two hundred. I wrapped the brisket about ' +
      "an hour ago and I just added wood. We'll serve in five hours. The fire has been " +
      'running hot, around two seventy five.',
    ideal: {
      probe3Name: 'Pork butt',
      probeTargets: [{ probe: 'probe three', target: 200 }],
      serveInMinutes: 300,
      stamps: [{ stamp: 'wrap', ago: 'about an hour ago' }, { stamp: 'wood' }],
      notes: 'The fire has been running hot, around 275.',
    },
    expected: {
      probe3Name: 'Pork butt',
      probe3Target: set(200),
      serveAt: new Date(2026, 9, 3, 20, 0),
      stamps: [{ stampKey: 'wood', label: 'Added Wood', at: FIXTURE_NOW }],
    },
    notes:
      'That the fire has been running hot, around 275, and that the brisket was wrapped ' +
      'about an hour ago — which is not logged, because the cook log is never backdated.',
    context: SMOKE_CONTEXT(NAMED_SMOKE),
  },
  {
    id: 'post-1',
    screen: 'postSmoke',
    covers: 'An empty screen: a rest in hours and minutes, steps, and an observation.',
    before: { restTime: '', steps: [''], notes: '' },
    script:
      'It rested for an hour and fifteen minutes. Then I sliced it against the grain and ' +
      'served it with pickles and white bread. The bark was fantastic but the flat was a ' +
      'little dry.',
    ideal: {
      restMinutes: 75,
      steps: ['Slice against the grain', 'Serve with pickles and white bread'],
      notes: 'The bark was fantastic but the flat was a little dry.',
    },
    expected: {
      restTime: '01:15',
      steps: ['Slice against the grain', 'Serve with pickles and white bread'],
    },
    notes: 'That the bark was fantastic and the flat a little dry.',
    context: CONTEXT,
  },
  {
    id: 'post-2',
    screen: 'postSmoke',
    covers:
      'A rest already on screen replaced by one said in words, three steps, and numbers that ' +
      'belong in Notes and in no field.',
    before: { restTime: '00:30', steps: [''], notes: '' },
    script:
      'I rested it a couple hours. Then I pulled the pork by hand, mixed the juices back in, ' +
      'and sauced half of it. Next time I would pull it off at one ninety eight instead of ' +
      'two oh three.',
    ideal: {
      restMinutes: 120,
      steps: ['Pull the pork by hand', 'Mix the juices back in', 'Sauce half of it'],
      notes: 'Next time, pull it off at 198 instead of 203.',
    },
    expected: {
      restTime: '02:00',
      steps: ['Pull the pork by hand', 'Mix the juices back in', 'Sauce half of it'],
    },
    notes: 'That next time it comes off at 198 instead of 203.',
    context: CONTEXT,
  },
  {
    id: 'post-3',
    screen: 'postSmoke',
    covers:
      'The heaviest Notes merge: about a hundred words of existing Notes rewritten with the ' +
      'new. A rest of no exact length fills nothing; steps are added after the one there.',
    before: {
      restTime: '',
      steps: ['Rest in the cooler wrapped in towels'],
      notes: LONG_SHORT_NOTES,
    },
    script:
      "I let it rest for a while, I didn't time it. Then I sliced the flat and cubed the " +
      'point for burnt ends. The slices were juicy but the burnt ends needed more sauce. It ' +
      'fed eight people with leftovers.',
    ideal: {
      steps: ['Slice the flat', 'Cube the point for burnt ends'],
      notes:
        `${LONG_SHORT_NOTES} It rested for a while, untimed. The slices were juicy but the ` +
        'burnt ends needed more sauce. It fed eight people with leftovers.',
    },
    expected: {
      steps: [
        'Rest in the cooler wrapped in towels',
        'Slice the flat',
        'Cube the point for burnt ends',
      ],
    },
    notes:
      'One text that still holds every fact and number of the old Notes, with the untimed ' +
      'rest, the juicy slices, the burnt ends wanting sauce and the eight people fed.',
    context: CONTEXT,
  },
];
