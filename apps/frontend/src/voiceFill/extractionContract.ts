/**
 * The extraction contract: every rule about what a Ramble fills.
 *
 * A model hears a Ramble and returns a raw object of plain values, leaving out
 * what was not said. Everything after that is decided here, in code that knows
 * no model: values are normalised, checked against their bounds and turned into
 * Review rows; a value that cannot be normalised or fails a bound fills nothing
 * and is kept in Notes instead. Whichever model is picked therefore obeys the
 * same contract, and the contract is testable with no model at all.
 */
import { enabledStamps } from '../api/cookStamps';
import type { PostSmoke, PreSmoke, SmokeProfile, TargetSource } from '../api/types';
import { WeightUnits } from '../components/common/interfaces/enums';
import {
  SCREEN_FIELDS,
  VoiceFillContext,
  VoiceFillFieldKey,
  VoiceFillScreen,
  fieldOf,
  probeTargetLabel,
} from './fieldDefinition';

/**
 * One probe's target as the smoke screen holds it: the temperature, whether the
 * probe is being watched, and where the temperature came from. The three travel
 * together because a spoken target changes all three, and Undo restores them.
 */
export interface VoiceFillProbeTarget {
  /** The temperature, °F, this probe's meat is done at. */
  target: number;
  /** Whether this probe is being watched. */
  enabled: boolean;
  targetSource: TargetSource;
}

/** One entry a Ramble adds to the cook log. */
export interface VoiceFillStamp {
  /** The key of the stamp it is logged under. */
  stampKey: string;
  /** What that stamp's button says, for the review list. */
  label: string;
  /** When it was done: the time of the Ramble, never earlier. */
  at: Date;
}

/**
 * The values the smoke screen holds: the smoke profile's names, wood and Notes,
 * each probe's target, the Serve Plan, and what a Ramble has logged.
 */
export interface SmokeScreenValues extends SmokeProfile {
  probe1Target: VoiceFillProbeTarget;
  probe2Target: VoiceFillProbeTarget;
  probe3Target: VoiceFillProbeTarget;
  /** When the food is meant to hit the table; `null` on a cook nobody planned. */
  serveAt: Date | null;
  /** How long the meat rests after the pull, in minutes; `null` on a cook with none. */
  restMinutes: number | null;
  /**
   * The cook log entries a Ramble adds. Written, never read: Undo puts back the
   * empty list, which is to say it takes those entries out again.
   */
  stamps: VoiceFillStamp[];
}

/** The values each fillable screen holds, in the shape that screen holds them. */
export interface VoiceFillScreenValues {
  preSmoke: PreSmoke;
  smoke: SmokeScreenValues;
  postSmoke: PostSmoke;
}

/**
 * One change a Ramble proposes to one field of a screen.
 *
 * It carries the value the field holds now beside the one it would be given, so
 * the review list can strike the old one through and Undo can put it back.
 */
export type ReviewRow<Values> = {
  [Field in keyof Values & string]: {
    /** What a row is ticked by. */
    id: string;
    field: Field;
    label: string;
    oldValue: Values[Field];
    newValue: Values[Field];
    /**
     * The steps this Ramble adds, on a step list's row only. The new value is
     * the whole list as it would be written; the review list shows just these.
     */
    added?: string[];
    /**
     * On a row whose new value was built from another row's: that row's id, and
     * what this row writes instead should that row be left unticked — nothing,
     * where there is nothing to build it from without it.
     */
    builtFrom?: { id: string; otherwise?: Values[Field] };
  };
}[keyof Values & string];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What the model said for a text field, or nothing where it said nothing. */
const spokenText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The words of something said, whatever their case and punctuation. */
const wordsOf = (said: string): string[] =>
  said
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** A single plain number written as text, or nothing where the text is not one. */
const plainNumber = (text: string): number | undefined =>
  /^\d+(\.\d+)?$/.test(text) ? Number(text) : undefined;

/**
 * A value the model was asked for as a number: the words to keep for Notes
 * should it be rejected, and the number where it is one. A model may write its
 * numbers as text.
 */
const spokenNumber = (value: unknown): { said: string; number?: number } => {
  if (typeof value === 'number') {
    return { said: String(value), number: value };
  }
  const said = spokenText(value);
  return { said, number: plainNumber(said) };
};

/**
 * A spoken pick from a suggestion list: the list's own spelling where it names
 * an entry exactly, whatever its case, and otherwise what was said. Nothing is
 * snapped to a near miss — a cut nobody listed is still the cut being cooked.
 */
const snapped = (spoken: string, suggestions: readonly string[] = []): string =>
  suggestions.find(suggestion => suggestion.toLowerCase() === spoken.toLowerCase()) ??
  capitalised(spoken);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The name the cook would get: the one spoken, or — only where the field holds
 * none — one built here from the day of the Ramble and the meat being cooked.
 *
 * Built in code rather than by the model, so an invented name can never replace
 * one somebody chose.
 */
const nameFor = (spoken: string, currentName: string, meatType: string, now: Date): string => {
  if (spoken) {
    return spoken;
  }
  if (currentName.trim() || !meatType) {
    return '';
  }
  return `${WEEKDAYS[now.getDay()]} ${meatType}`;
};

/** The heaviest cut a Ramble can fill: a weight must be over 0 and at most this. */
export const MAX_WEIGHT = 200;

/**
 * The ways a model spells the units the screen offers. A map, not an object: a
 * word is looked up as the model gave it, and an object would answer for every
 * name it inherits — `constructor` is no unit.
 */
const UNIT_WORDS: ReadonlyMap<string, WeightUnits> = new Map([
  ['lb', WeightUnits.LB],
  ['lbs', WeightUnits.LB],
  ['pound', WeightUnits.LB],
  ['pounds', WeightUnits.LB],
  ['oz', WeightUnits.OZ],
  ['ounce', WeightUnits.OZ],
  ['ounces', WeightUnits.OZ],
  ['kg', WeightUnits.KG],
  ['kgs', WeightUnits.KG],
  ['kilo', WeightUnits.KG],
  ['kilos', WeightUnits.KG],
  ['kilogram', WeightUnits.KG],
  ['kilograms', WeightUnits.KG],
]);

/**
 * The unit a spoken word names, whatever its case and however it is punctuated
 * ("lbs." is pounds), or nothing where the screen offers no such unit.
 */
const unitFor = (said: string): WeightUnits | undefined =>
  UNIT_WORDS.get(said.toLowerCase().replace(/[^a-z]/g, ''));

/**
 * A weight as the model gave it: the words to keep for Notes should it be
 * rejected, and the plain number where it is one. "About" is dropped; anything
 * else that is not a single number — a range above all — has no number.
 */
const spokenWeight = (value: unknown): { said: string; weight?: number } => {
  if (typeof value === 'number') {
    return { said: String(value), weight: value };
  }
  if (Array.isArray(value)) {
    return { said: value.join(' to ') };
  }
  const said = spokenText(value);
  const plain = said.replace(/^(about|around|roughly|approximately|nearly|~)\s*/i, '');
  return { said, weight: plainNumber(plain) };
};

/**
 * The weight and unit a Ramble would write, or the words to keep in Notes where
 * what was said cannot be written: a range, a weight out of bounds, or a unit
 * the screen does not offer. A unit nobody spoke stays as it is on screen.
 */
const weightFor = (
  raw: Record<string, unknown>,
  current: PreSmoke['weight']
): { value: PreSmoke['weight'] } | { leftover: string } | undefined => {
  const { said, weight } = spokenWeight(raw.weight);
  const saidUnit = spokenText(raw.weightUnit);
  if (!said && !saidUnit) {
    return undefined;
  }
  const unit = saidUnit ? unitFor(saidUnit) : current.unit;
  const weightIsUsable = !said || (weight !== undefined && weight > 0 && weight <= MAX_WEIGHT);
  if (!weightIsUsable || !unit) {
    return { leftover: [said, saidUnit].filter(Boolean).join(' ') };
  }
  return { value: { weight: weight ?? current.weight, unit } };
};

/**
 * Whether two weights say the same thing. The form holds what was typed, so a
 * weight on screen can be the text of a number; and one nobody entered is no
 * number at all, which is the same as another nobody entered.
 */
const sameWeight = (a: PreSmoke['weight'], b: PreSmoke['weight']): boolean =>
  a.unit === b.unit && String(a.weight ?? '') === String(b.weight ?? '');

/**
 * A step list less the empty lines it ends with. A list nobody has typed into
 * is one empty line, and appending after it would leave a hole at the top.
 */
const withoutTrailingBlanks = (steps: readonly string[]): string[] => {
  let end = steps.length;
  while (end > 0 && !steps[end - 1].trim()) {
    end -= 1;
  }
  return steps.slice(0, end);
};

/**
 * A step as it is compared: its letters and digits in any script, whatever
 * their case, and the point inside a number — 1.5 oz is not 15 oz. A step with
 * no letter or digit in it is compared as it was written, so it is never taken
 * for an empty line.
 */
const stepKey = (step: string): string => {
  const written = step.toLowerCase().replace(/\s+/g, ' ').trim();
  const key = written
    .replace(/(\d)\.(?=\d)|[^\p{L}\p{M}\p{N}\s]/gu, (_match, digit?: string) =>
      digit === undefined ? '' : `${digit}.`
    )
    .replace(/\s+/g, ' ')
    .trim();
  return key || written;
};

/**
 * The step list a Ramble would write and the steps it adds to it: the spoken
 * steps, in spoken order, after the ones already there. A step that is already
 * on the list, give or take its case and punctuation, is not added again.
 */
const stepsFor = (
  raw: unknown,
  current: readonly string[]
): { steps: string[]; added: string[] } => {
  const spoken = Array.isArray(raw) ? raw.map(spokenText).filter(Boolean) : [];
  const known = new Set(current.map(stepKey));
  const added: string[] = [];
  spoken.forEach(step => {
    if (!known.has(stepKey(step))) {
      known.add(stepKey(step));
      added.push(capitalised(step));
    }
  });
  return { steps: [...withoutTrailingBlanks(current), ...added], added };
};

/**
 * The longest existing Notes a model is given to merge, in words. Longer Notes
 * are never rewritten: the Ramble's summary is added after them instead.
 */
export const NOTES_MERGE_WORD_LIMIT = 150;

/**
 * Whether Notes are short enough to be merged with a Ramble's summary into one
 * text — and so whether they are handed to the model to merge at all.
 */
export const notesAreMerged = (existing: string): boolean =>
  existing.split(/\s+/).filter(Boolean).length <= NOTES_MERGE_WORD_LIMIT;

/**
 * What Notes become: what the model wrote for them, and every value this
 * Ramble gave that could not be written to its field.
 *
 * For Notes short enough to have been merged, the model's text already holds
 * the old Notes and replaces them. Longer Notes — and Notes the model wrote
 * nothing for — are kept as they are, with the new text as a paragraph after
 * them. Nothing left over leaves Notes alone.
 */
const notesFor = (existing: string, summary: string, leftovers: readonly string[]): string => {
  const addition = [summary, ...leftovers].filter(Boolean).join(' ');
  const kept = summary && notesAreMerged(existing) ? '' : existing;
  return [kept, addition].filter(Boolean).join('\n\n');
};

/** The shortest and the longest rest a Ramble can fill, in minutes. */
export const MIN_REST_MINUTES = 1;
export const MAX_REST_MINUTES = 24 * 60;

/**
 * The rests said in words that are still an exact length. Anything vaguer — "a
 * few hours", "a while" — is no length at all.
 */
const REST_PHRASES: ReadonlyMap<string, number> = new Map([
  ['a couple hours', 120],
  ['a couple of hours', 120],
  ['half an hour', 30],
]);

/**
 * The rest a Ramble gives, in whole minutes, or the words to keep in Notes
 * where the rest is out of bounds or is no exact length. One rule for the one
 * rest a cook has, whichever screen it is spoken on.
 */
const restMinutesFor = (raw: unknown): { minutes: number } | { leftover: string } | undefined => {
  const { said, number } = spokenNumber(raw);
  if (!said) {
    return undefined;
  }
  const spoken = number ?? REST_PHRASES.get(wordsOf(said).join(' '));
  if (spoken === undefined) {
    return { leftover: said };
  }
  // The bounds are on what was said, before it is rounded to whole minutes:
  // half a minute is not the shortest rest.
  if (!(spoken >= MIN_REST_MINUTES && spoken <= MAX_REST_MINUTES)) {
    return { leftover: `${said} minutes` };
  }
  return { minutes: Math.round(spoken) };
};

/**
 * The rest a Ramble would write to the post-smoke screen, in the `HH:MM` its
 * field is masked to, or the words to keep in Notes where there is no writing it.
 */
const restTimeFor = (raw: unknown): { value: string } | { leftover: string } | undefined => {
  const rest = restMinutesFor(raw);
  if (!rest || 'leftover' in rest) {
    return rest;
  }
  const pad = (part: number): string => String(part).padStart(2, '0');
  return { value: `${pad(Math.floor(rest.minutes / 60))}:${pad(rest.minutes % 60)}` };
};

/** The parts of a screen every fillable screen has: a step list and Notes. */
type StepsAndNotes = Pick<PostSmoke, 'steps' | 'notes'>;

/** The row for the steps a Ramble adds, where it adds any. */
const stepsRows = (
  screen: 'preSmoke' | 'postSmoke',
  raw: Record<string, unknown>,
  current: StepsAndNotes
): ReviewRow<StepsAndNotes>[] => {
  const { steps, added } = stepsFor(raw.steps, current.steps);
  if (added.length === 0) {
    return [];
  }
  return [
    {
      id: 'steps',
      field: 'steps',
      label: fieldOf(screen, 'steps').label,
      oldValue: current.steps,
      newValue: steps,
      added,
    },
  ];
};

/** The row for what Notes become, where the Ramble leaves anything for them. */
const notesRows = <Notes extends string | undefined>(
  screen: VoiceFillScreen,
  raw: Record<string, unknown>,
  current: { notes?: Notes },
  leftovers: readonly string[]
): ReviewRow<{ notes: Notes | string }>[] => {
  const existing = (current.notes ?? '').trim();
  const notes = notesFor(existing, spokenText(raw.notes), leftovers);
  if (notes === existing) {
    return [];
  }
  return [
    {
      id: 'notes',
      field: 'notes',
      label: fieldOf(screen, 'notes').label,
      oldValue: current.notes as Notes,
      newValue: notes,
    },
  ];
};

/** A value that was said but cannot be written, worded for Notes. */
const leftoverOf = <Screen extends VoiceFillScreen>(
  screen: Screen,
  key: VoiceFillFieldKey<Screen>,
  said: string
): string => `${fieldOf(screen, key).label}: ${said}.`;

/** Whatever a model returned for a field, as words for Notes. */
const saidOf = (value: unknown): string => {
  if (typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(saidOf).filter(Boolean).join(', ');
  }
  if (isRecord(value)) {
    return Object.values(value).map(saidOf).filter(Boolean).join(' ');
  }
  return spokenText(value);
};

/**
 * The words to keep in Notes for every value a model returned that belongs to
 * another screen. A Ramble fills only the screen it was spoken on, and what it
 * says of the others is neither written where nobody is looking nor dropped.
 */
const saidOfOtherScreens = (screen: VoiceFillScreen, raw: Record<string, unknown>): string[] => {
  const kept = new Map<string, string>();
  const here = new Set(SCREEN_FIELDS[screen].fields.map(field => field.key));
  Object.values(SCREEN_FIELDS).forEach(({ fields }) =>
    fields.forEach(field => {
      const said = here.has(field.key) || kept.has(field.key) ? '' : saidOf(raw[field.key]);
      if (said) {
        kept.set(field.key, `${field.label}: ${said}.`);
      }
    })
  );
  return [...kept.values()];
};

const preSmokeRows = (
  raw: Record<string, unknown>,
  current: PreSmoke,
  now: Date
): ReviewRow<PreSmoke>[] => {
  const rows: ReviewRow<PreSmoke>[] = [];
  const leftovers: string[] = [];
  const label = (key: VoiceFillFieldKey<'preSmoke'>): string => fieldOf('preSmoke', key).label;

  const currentMeatType = (current.meatType ?? '').trim();
  const spokenMeatType = spokenText(raw.meatType);
  const meatType = spokenMeatType
    ? snapped(spokenMeatType, fieldOf('preSmoke', 'meatType').suggestions)
    : currentMeatType;

  const spokenName = spokenText(raw.name);
  const name = nameFor(spokenName, current.name ?? '', meatType, now);
  if (name && name !== current.name) {
    // A name built from the meat this Ramble names stands on the meat type
    // row. Left unticked, the meat stays what it was, and so the name is built
    // from that — or not at all, where the screen holds no meat type.
    const builtFromSpokenMeat = !spokenName && meatType !== currentMeatType;
    rows.push({
      id: 'name',
      field: 'name',
      label: label('name'),
      oldValue: current.name,
      newValue: name,
      ...(builtFromSpokenMeat && {
        builtFrom: {
          id: 'meatType',
          otherwise: nameFor('', current.name ?? '', currentMeatType, now) || undefined,
        },
      }),
    });
  }

  if (meatType !== currentMeatType) {
    rows.push({
      id: 'meatType',
      field: 'meatType',
      label: label('meatType'),
      oldValue: current.meatType,
      newValue: meatType,
    });
  }

  const weight = weightFor(raw, current.weight);
  if (weight && 'leftover' in weight) {
    leftovers.push(leftoverOf('preSmoke', 'weight', weight.leftover));
  } else if (weight && !sameWeight(weight.value, current.weight)) {
    rows.push({
      id: 'weight',
      field: 'weight',
      label: label('weight'),
      oldValue: current.weight,
      newValue: weight.value,
    });
  }

  return [
    ...rows,
    ...stepsRows('preSmoke', raw, current),
    ...notesRows('preSmoke', raw, current, [...leftovers, ...saidOfOtherScreens('preSmoke', raw)]),
  ];
};

const postSmokeRows = (
  raw: Record<string, unknown>,
  current: PostSmoke
): ReviewRow<PostSmoke>[] => {
  const rows: ReviewRow<PostSmoke>[] = [];
  const leftovers: string[] = [];

  const restTime = restTimeFor(raw.restMinutes);
  if (restTime && 'leftover' in restTime) {
    leftovers.push(leftoverOf('postSmoke', 'restMinutes', restTime.leftover));
  } else if (restTime && restTime.value !== current.restTime) {
    rows.push({
      id: 'restTime',
      field: 'restTime',
      label: fieldOf('postSmoke', 'restMinutes').label,
      oldValue: current.restTime,
      newValue: restTime.value,
    });
  }

  return [
    ...rows,
    ...stepsRows('postSmoke', raw, current),
    ...notesRows('postSmoke', raw, current, [
      ...leftovers,
      ...saidOfOtherScreens('postSmoke', raw),
    ]),
  ];
};

/** The three meat probes, by the number each is spoken of by. */
const PROBES = [1, 2, 3] as const;

type Probe = (typeof PROBES)[number];

/** The fields a Ramble names as spoken: the chamber and each probe. */
const NAME_FIELDS = ['chamberName', 'probe1Name', 'probe2Name', 'probe3Name'] as const;

/** The field a probe's target is held under. */
const targetField = (probe: Probe): `probe${Probe}Target` => `probe${probe}Target`;

/** The ways a probe's number is said. A map, for the reason the units are one. */
const PROBE_NUMBERS: ReadonlyMap<string, Probe> = new Map([
  ['1', 1],
  ['one', 1],
  ['first', 1],
  ['2', 2],
  ['two', 2],
  ['second', 2],
  ['3', 3],
  ['three', 3],
  ['third', 3],
]);

/** The words a probe's number is said among, which say nothing themselves. */
const NUMBER_FILLER = new Set(['the', 'probe', 'number', 'meat']);

/**
 * The probe something said points at by its number — "probe one", "the second
 * probe", "3" — or nothing where it is not a probe's number and nothing else.
 */
const numberedProbe = (said: string): Probe | undefined => {
  const told = wordsOf(said).filter(word => !NUMBER_FILLER.has(word));
  return told.length === 1 ? PROBE_NUMBERS.get(told[0]) : undefined;
};

/**
 * A probe's name as it is compared: its words, less a leading "the" and a
 * closing "probe" — "the flat probe" is the probe called Flat. A name that is
 * nothing but those words is compared as it stands.
 */
const nameKey = (name: string): string => {
  const words = wordsOf(name);
  const named = words[0] === 'the' && words.length > 1 ? words.slice(1) : words;
  const told = named[named.length - 1] === 'probe' && named.length > 1 ? named.slice(0, -1) : named;
  return told.join(' ');
};

/**
 * The name each probe goes by while a Ramble is read: the one the Ramble gives
 * it, and otherwise the current one — the context's, which is what the model
 * was told, or the screen's where the context carries no names.
 */
const probeNames = (
  raw: Record<string, unknown>,
  current: SmokeScreenCurrent,
  context: VoiceFillContext
): ReadonlyMap<Probe, string> =>
  new Map(
    PROBES.map(probe => [
      probe,
      spokenText(raw[`probe${probe}Name`]) ||
        (context.probeNames
          ? spokenText(context.probeNames[probe - 1])
          : current[`probe${probe}Name`]),
    ])
  );

/** The words that say every probe: "both" and "all", and the same said as "every" or "each". */
const EVERY_PROBE = new Set(['both', 'all', 'every', 'each']);

/** The words "both" and "all" are said among, which say nothing themselves. */
const EVERY_FILLER = new Set(['the', 'of', 'them', 'probe', 'probes', 'meat', 'three', '3']);

/**
 * Whether something said means every probe — "both", "all three", "all of the
 * probes" — and nothing else: "all beef ribs" is a name, and no probe's.
 */
const saysEveryProbe = (said: string): boolean => {
  const told = wordsOf(said).filter(word => !EVERY_FILLER.has(word));
  return told.length === 1 && EVERY_PROBE.has(told[0]);
};

/**
 * The probes something said points at. A spoken number wins; with none, the
 * probe that goes by that name — one probe, or it is anybody's guess which.
 * "Both" and "all" are the probes this Ramble gave a name to, and every probe
 * where it named none. Anything else points at nothing.
 */
const probesFor = (
  said: string,
  names: ReadonlyMap<Probe, string>,
  namedHere: readonly Probe[]
): readonly Probe[] => {
  const numbered = numberedProbe(said);
  if (numbered) {
    return [numbered];
  }
  const key = nameKey(said);
  const called = PROBES.filter(probe => key && nameKey(names.get(probe) ?? '') === key);
  if (called.length > 0) {
    return called.length === 1 ? called : [];
  }
  if (saysEveryProbe(said)) {
    return namedHere.length > 0 ? namedHere : PROBES;
  }
  return [];
};

/** The lowest and the highest target a Ramble can set, in °F. */
export const MIN_PROBE_TARGET = 32;
export const MAX_PROBE_TARGET = 500;

/**
 * The target a Ramble sets for each probe it sets one for, and the words to
 * keep in Notes for every target that could not be set: one out of bounds, not
 * a whole number of degrees or not a temperature at all, one said of no probe
 * the screen can tell, and the targets of a probe that was given two.
 */
const targetsFor = (
  raw: Record<string, unknown>,
  current: SmokeScreenCurrent,
  context: VoiceFillContext
): { targets: ReadonlyMap<Probe, number>; leftovers: string[] } => {
  const names = probeNames(raw, current, context);
  const namedHere = PROBES.filter(probe => spokenText(raw[`probe${probe}Name`]));
  const said = new Map<Probe, Set<number>>();
  const leftovers: string[] = [];
  const keep = (words: string): void => {
    leftovers.push(leftoverOf('smoke', 'probeTargets', words));
  };
  (Array.isArray(raw.probeTargets) ? raw.probeTargets.filter(isRecord) : []).forEach(entry => {
    const { said: saidTarget, number } = spokenNumber(entry.target);
    if (!saidTarget) {
      return;
    }
    const saidProbe = spokenText(entry.probe);
    // A target is a whole number of degrees within the bounds. A part of a
    // degree is never rounded to one: nobody said the number it would become.
    const target = number ?? NaN;
    const settable =
      Number.isInteger(target) && target >= MIN_PROBE_TARGET && target <= MAX_PROBE_TARGET;
    const probes = settable ? probesFor(saidProbe, names, namedHere) : [];
    if (probes.length === 0) {
      keep([saidProbe, saidTarget].filter(Boolean).join(' '));
    }
    probes.forEach(probe => said.set(probe, (said.get(probe) ?? new Set<number>()).add(target)));
  });
  const targets = new Map<Probe, number>();
  PROBES.forEach(probe => {
    const [target, ...others] = said.get(probe) ?? [];
    if (others.length > 0) {
      // Two targets for one probe is a choice nobody made: neither is set.
      keep(`probe ${probe} ${[target, ...others].join(' or ')}`);
    } else if (target !== undefined) {
      targets.set(probe, target);
    }
  });
  return { targets, leftovers };
};

/**
 * A time on the clock as it was said — "6:30", "6:30 PM", "18:30" — as its
 * minute and every hour of the day it could mean, earliest first: two where
 * neither AM nor PM was said of an hour both have. Nothing where what was said
 * is no time on the clock.
 */
const spokenClock = (said: string): { hours: number[]; minute: number } | undefined => {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s?m\.?)?$/.exec(said.toLowerCase());
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const half = match[3];
  if (minute > 59 || hour > 23 || (half && (hour < 1 || hour > 12))) {
    return undefined;
  }
  if (half) {
    return { hours: [(hour % 12) + (half === 'p' ? 12 : 0)], minute };
  }
  // An hour only the 24-hour clock has is one hour; any other is two.
  return { hours: hour >= 1 && hour <= 12 ? [hour % 12, (hour % 12) + 12] : [hour], minute };
};

/**
 * The date a time on the clock means to somebody saying it at `now`: tomorrow's
 * where they said tomorrow, and otherwise its next occurrence. Where it could
 * be morning or evening and both are still to come that day, the evening —
 * nobody plans dinner for dawn by leaving out "AM".
 */
const clockDate = (
  clock: { hours: number[]; minute: number },
  tomorrow: boolean,
  now: Date
): Date => {
  const on = (daysAhead: number): Date[] =>
    clock.hours.map(
      hour =>
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, hour, clock.minute)
    );
  const sameDay = tomorrow ? on(1) : on(0).filter(date => date.getTime() > now.getTime());
  return sameDay.length > 0 ? sameDay[sameDay.length - 1] : on(1)[0];
};

const MINUTE_MS = 60 * 1000;

/** How far ahead a Ramble can set the serve time, in minutes: the next 48 hours. */
export const MAX_SERVE_AHEAD_MINUTES = 48 * 60;

/**
 * The serve time a Ramble sets, as a date — a time on the clock, or so many
 * minutes after the Ramble — or the words to keep in Notes where what was said
 * pins down no time in the next 48 hours: no clock time at all, an offset out
 * of bounds, or a clock time and an offset that are two answers.
 */
const serveAtFor = (
  raw: Record<string, unknown>,
  now: Date
): { value: Date } | { leftover: string } | undefined => {
  const saidClock = spokenText(raw.serveClock);
  const tomorrow = raw.serveTomorrow === true;
  const { said: saidOffset, number: offset } = spokenNumber(raw.serveInMinutes);
  const said = [
    [saidClock, tomorrow ? 'tomorrow' : ''].filter(Boolean).join(' '),
    saidOffset && `in ${saidOffset}${offset === undefined ? '' : ' minutes'}`,
  ].filter(Boolean);
  if (said.length === 0) {
    return undefined;
  }
  const leftover = { leftover: said.join(' or ') };
  if (said.length > 1) {
    return leftover;
  }
  const clock = spokenClock(saidClock);
  const value = clock
    ? clockDate(clock, tomorrow, now)
    : new Date(now.getTime() + Math.round(offset ?? 0) * MINUTE_MS);
  const ahead = value.getTime() - now.getTime();
  return ahead > 0 && ahead <= MAX_SERVE_AHEAD_MINUTES * MINUTE_MS ? { value } : leftover;
};

/** The ways "just now" comes back as how long ago something was done. */
const JUST_NOW = new Set(['', 'now', 'just', 'just now', 'right now']);

/**
 * The cook log entries a Ramble adds, and the words to keep in Notes for what
 * it may not log: a stamp the cook log does not offer, and anything done a
 * while ago — the log is never backdated, so that goes to Notes as it was said.
 */
const stampsFor = (
  raw: unknown,
  context: VoiceFillContext
): { stamps: VoiceFillStamp[]; leftovers: string[] } => {
  const offered = enabledStamps(context.enabledStamps ?? []);
  const sayable = (text: string): string => wordsOf(text).join(' ');
  const logged = new Map<string, VoiceFillStamp>();
  const leftovers: string[] = [];
  (Array.isArray(raw) ? raw.filter(isRecord) : []).forEach(entry => {
    const said = spokenText(entry.stamp);
    // However the model wrote it — a number of minutes is an offset all the same.
    const ago = spokenNumber(entry.ago).said;
    const justNow = JUST_NOW.has(wordsOf(ago).join(' '));
    if (!said) {
      return;
    }
    // By its key, or by what its button says: a stamp somebody added has a key
    // nobody could say.
    const stamp = offered.find(
      candidate =>
        candidate.key.toLowerCase() === said.toLowerCase() ||
        sayable(candidate.label) === sayable(said)
    );
    if (!stamp || !justNow) {
      const words = [stamp?.label ?? said, justNow ? '' : ago].filter(Boolean).join(' ');
      leftovers.push(leftoverOf('smoke', 'stamps', words));
    } else {
      logged.set(stamp.key, { stampKey: stamp.key, label: stamp.label, at: context.now });
    }
  });
  return { stamps: [...logged.values()], leftovers };
};

/**
 * The smoke screen's values as a Ramble is read against them: everything it
 * holds but the cook log entries, which a Ramble only ever adds.
 */
export type SmokeScreenCurrent = Omit<SmokeScreenValues, 'stamps'>;

const smokeRows = (
  raw: Record<string, unknown>,
  current: SmokeScreenCurrent,
  context: VoiceFillContext
): ReviewRow<SmokeScreenValues>[] => {
  const rows: ReviewRow<SmokeScreenValues>[] = [];
  const leftovers: string[] = [];
  const label = (key: VoiceFillFieldKey<'smoke'>): string => fieldOf('smoke', key).label;

  NAME_FIELDS.forEach(field => {
    const name = spokenText(raw[field]);
    if (name && name !== current[field]) {
      rows.push({
        id: field,
        field,
        label: label(field),
        oldValue: current[field],
        newValue: name,
      });
    }
  });

  const spokenWood = spokenText(raw.woodType);
  const woodType = spokenWood
    ? snapped(spokenWood, fieldOf('smoke', 'woodType').suggestions)
    : current.woodType;
  if (woodType !== current.woodType) {
    rows.push({
      id: 'woodType',
      field: 'woodType',
      label: label('woodType'),
      oldValue: current.woodType,
      newValue: woodType,
    });
  }

  const { targets, leftovers: unsetTargets } = targetsFor(raw, current, context);
  leftovers.push(...unsetTargets);
  targets.forEach((target, probe) => {
    const field = targetField(probe);
    const held = current[field];
    if (held.target === target && held.enabled && held.targetSource === 'user') {
      return;
    }
    rows.push({
      id: field,
      field,
      label: probeTargetLabel(probe),
      oldValue: held,
      // A spoken target is the cook's own, exactly as a typed one is: the probe
      // is watched from here on, and a session start never seeds over it.
      newValue: { target, enabled: true, targetSource: 'user' },
    });
  });

  const serveAt = serveAtFor(raw, context.now);
  if (serveAt && 'leftover' in serveAt) {
    leftovers.push(leftoverOf('smoke', 'serveClock', serveAt.leftover));
  } else if (serveAt && serveAt.value.getTime() !== current.serveAt?.getTime()) {
    rows.push({
      id: 'serveAt',
      field: 'serveAt',
      label: label('serveClock'),
      oldValue: current.serveAt,
      newValue: serveAt.value,
    });
  }

  const rest = restMinutesFor(raw.restMinutes);
  if (rest && 'leftover' in rest) {
    leftovers.push(leftoverOf('smoke', 'restMinutes', rest.leftover));
  } else if (rest && rest.minutes !== current.restMinutes) {
    rows.push({
      id: 'restMinutes',
      field: 'restMinutes',
      label: label('restMinutes'),
      oldValue: current.restMinutes,
      newValue: rest.minutes,
    });
  }

  const { stamps, leftovers: unlogged } = stampsFor(raw.stamps, context);
  leftovers.push(...unlogged);
  if (stamps.length > 0) {
    rows.push({
      id: 'stamps',
      field: 'stamps',
      label: label('stamps'),
      oldValue: [],
      newValue: stamps,
    });
  }

  leftovers.push(...saidOfOtherScreens('smoke', raw));

  return [...rows, ...notesRows('smoke', raw, current, leftovers)];
};

/**
 * The Review rows a Ramble proposes for the screen it was spoken on.
 *
 * `raw` is whatever the model returned and is trusted for nothing: a field of
 * the wrong type is treated as not said. `context` carries what the Ramble is
 * read against beside the screen's values — when it was spoken, above all: the
 * contract never asks a clock of its own.
 */
export function reviewRows(
  screen: 'preSmoke',
  raw: unknown,
  current: PreSmoke,
  context: VoiceFillContext
): ReviewRow<PreSmoke>[];
export function reviewRows(
  screen: 'smoke',
  raw: unknown,
  current: SmokeScreenCurrent,
  context: VoiceFillContext
): ReviewRow<SmokeScreenValues>[];
export function reviewRows(
  screen: 'postSmoke',
  raw: unknown,
  current: PostSmoke,
  context: VoiceFillContext
): ReviewRow<PostSmoke>[];
export function reviewRows(
  screen: VoiceFillScreen,
  raw: unknown,
  current: PreSmoke | SmokeScreenCurrent | PostSmoke,
  context: VoiceFillContext
): ReviewRow<PreSmoke>[] | ReviewRow<SmokeScreenValues>[] | ReviewRow<PostSmoke>[] {
  if (!isRecord(raw)) {
    return [];
  }
  switch (screen) {
    case 'preSmoke':
      return preSmokeRows(raw, current as PreSmoke, context.now);
    case 'smoke':
      return smokeRows(raw, current as SmokeScreenCurrent, context);
    default:
      return postSmokeRows(raw, current as PostSmoke);
  }
}

/**
 * The id of the row a row cannot be written without: the one its value was
 * built from, where there is nothing to write in its place.
 */
const standsOn = <Values>(row: ReviewRow<Values>): string | undefined =>
  row.builtFrom && row.builtFrom.otherwise === undefined ? row.builtFrom.id : undefined;

/**
 * The ids left ticked once the row `rowId` is tapped, in the rows' own order.
 *
 * A row that cannot be written without another is never left ticked alone: it
 * is unticked with the row it stands on, and ticking it ticks that row too. So
 * every ticked row is one {@link fillFor} writes, and the number of rows ticked
 * is the number of fields a fill changes.
 */
export const tickedAfterToggle = <Values>(
  rows: readonly ReviewRow<Values>[],
  ticked: Iterable<string>,
  rowId: string
): string[] => {
  const tapped = rows.find(row => row.id === rowId);
  const next = new Set(ticked);
  if (!tapped) {
    return rows.map(row => row.id).filter(id => next.has(id));
  }
  if (next.has(rowId)) {
    next.delete(rowId);
    rows.filter(row => standsOn(row) === rowId).forEach(row => next.delete(row.id));
  } else {
    next.add(rowId);
    const stoodOn = standsOn(tapped);
    if (stoodOn !== undefined) {
      next.add(stoodOn);
    }
  }
  return rows.map(row => row.id).filter(id => next.has(id));
};

/** What filling a set of Review rows writes, and what Undo then puts back. */
export interface VoiceFillWrite<Values> {
  /** The values to write to the screen, field by field. */
  write: Partial<Values>;
  /** The values those same fields held before, for Undo to restore. */
  undo: Partial<Values>;
}

/**
 * The values to write for the rows left ticked, and the Undo for exactly those.
 *
 * `ticked` holds the ids of the rows to apply. A row that was unticked is in
 * neither half: it is not written, so Undo has nothing of it to restore. A row
 * built from an unticked one writes what it would have been without it.
 */
export const fillFor = <Values>(
  rows: readonly ReviewRow<Values>[],
  ticked: Iterable<string>
): VoiceFillWrite<Values> => {
  const tickedIds = new Set(ticked);
  const write: Partial<Values> = {};
  const undo: Partial<Values> = {};
  rows
    .filter(row => tickedIds.has(row.id))
    .forEach(row => {
      const value =
        row.builtFrom && !tickedIds.has(row.builtFrom.id) ? row.builtFrom.otherwise : row.newValue;
      if (value === undefined) {
        return;
      }
      write[row.field] = value;
      undo[row.field] = row.oldValue;
    });
  return { write, undo };
};
