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
import type { PostSmoke, PreSmoke } from '../api/types';
import { WeightUnits } from '../components/common/interfaces/enums';
import { VoiceFillFieldKey, VoiceFillScreen, fieldOf } from './fieldDefinition';

/** The values each fillable screen holds, in the shape that screen holds them. */
export interface VoiceFillScreenValues {
  preSmoke: PreSmoke;
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

/** A single plain number written as text, or nothing where the text is not one. */
const plainNumber = (text: string): number | undefined =>
  /^\d+(\.\d+)?$/.test(text) ? Number(text) : undefined;

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
 * The rest a Ramble would write, in the `HH:MM` the screen's field is masked
 * to, or the words to keep in Notes where the rest is out of bounds or is not a
 * number of minutes at all.
 */
const restTimeFor = (raw: unknown): { value: string } | { leftover: string } | undefined => {
  const said = typeof raw === 'number' ? String(raw) : spokenText(raw);
  if (!said) {
    return undefined;
  }
  // A model may write its numbers as text, as it may for a weight.
  const spoken = typeof raw === 'number' ? raw : plainNumber(said);
  if (spoken === undefined) {
    return { leftover: said };
  }
  // The bounds are on what was said, before it is rounded to whole minutes:
  // half a minute is not the shortest rest.
  if (!(spoken >= MIN_REST_MINUTES && spoken <= MAX_REST_MINUTES)) {
    return { leftover: `${said} minutes` };
  }
  const minutes = Math.round(spoken);
  const pad = (part: number): string => String(part).padStart(2, '0');
  return { value: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` };
};

/** The parts of a screen every fillable screen has: a step list and Notes. */
type StepsAndNotes = Pick<PostSmoke, 'steps' | 'notes'>;

/** The row for the steps a Ramble adds, where it adds any. */
const stepsRows = (
  screen: VoiceFillScreen,
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
const notesRows = (
  screen: VoiceFillScreen,
  raw: Record<string, unknown>,
  current: StepsAndNotes,
  leftovers: readonly string[]
): ReviewRow<StepsAndNotes>[] => {
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
      oldValue: current.notes,
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
    ...notesRows('preSmoke', raw, current, leftovers),
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
    ...notesRows('postSmoke', raw, current, leftovers),
  ];
};

/**
 * The Review rows a Ramble proposes for the screen it was spoken on.
 *
 * `raw` is whatever the model returned and is trusted for nothing: a field of
 * the wrong type is treated as not said. `now` is when the Ramble was spoken.
 */
export function reviewRows(
  screen: 'preSmoke',
  raw: unknown,
  current: PreSmoke,
  now: Date
): ReviewRow<PreSmoke>[];
export function reviewRows(
  screen: 'postSmoke',
  raw: unknown,
  current: PostSmoke,
  now: Date
): ReviewRow<PostSmoke>[];
export function reviewRows(
  screen: VoiceFillScreen,
  raw: unknown,
  current: PreSmoke | PostSmoke,
  now: Date
): ReviewRow<PreSmoke>[] | ReviewRow<PostSmoke>[] {
  if (!isRecord(raw)) {
    return [];
  }
  return screen === 'preSmoke'
    ? preSmokeRows(raw, current as PreSmoke, now)
    : postSmokeRows(raw, current as PostSmoke);
}

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
