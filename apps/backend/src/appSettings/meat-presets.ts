/**
 * The meat categories the smoker keeps a default target temperature for, the
 * keyword matcher that decides which one a cook is doing, and the rule for
 * putting that category's temperature onto the probes.
 *
 * Pure, and deliberately so: "which probes may be seeded" is the whole of this
 * feature's judgement, and it is decided here over plain values rather than
 * anywhere that also has to talk to the database.
 */
import { ProbeTargetEntry, TargetPresets } from './app-settings.schema';

/** The categories a default target temperature is kept for. */
export const MEAT_CATEGORIES = ['beef', 'pork', 'poultry'] as const;

export type MeatCategory = (typeof MEAT_CATEGORIES)[number];

/**
 * The words that name the animal outright.
 *
 * Checked before any cut, because the animal settles the question whatever cut
 * follows it: "pork sirloin" is pork and "turkey bacon" is poultry, though both
 * cuts otherwise belong to another category's list.
 */
const CATEGORY_ANIMALS: Record<MeatCategory, readonly string[]> = {
  beef: ['beef'],
  pork: ['pork'],
  poultry: ['poultry', 'chicken', 'turkey', 'duck'],
};

/**
 * The cuts that give a category away on their own.
 *
 * Cuts as well as animals, because nobody types "pork" into the pre-smoke form
 * when they are cooking a rack of baby backs. Only cuts that come off one of
 * these three animals are listed: a bare "steak", "shoulder" or "rib" is also a
 * lamb, venison or tuna cut, and matching one would seed a temperature from a
 * category the meat does not belong to — worse than the nothing an unrecognised
 * meat gets, because the number would look deliberate.
 */
const CATEGORY_CUTS: Record<MeatCategory, readonly string[]> = {
  beef: [
    'brisket',
    'packer',
    'chuck',
    'tri-tip',
    'tritip',
    'ribeye',
    'rib eye',
    'prime rib',
    'short rib',
    'burnt ends',
  ],
  pork: [
    'baby back',
    'spare rib',
    'st louis',
    'boston butt',
    'pork butt',
    'picnic shoulder',
    'bacon',
    'ham',
    'sausage',
  ],
  poultry: ['wing', 'thigh', 'drumstick', 'spatchcock'],
};

/**
 * Whether a keyword names something in this description.
 *
 * Whole words with an optional plural, never a bare substring: "ribeye" is not
 * a rack of ribs and "hamburger" is not a ham, and both would be miscategorised
 * by a plain `includes`.
 */
const namesCut = (text: string, keyword: string): boolean =>
  new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`).test(
    text,
  );

/**
 * The category a free-text meat type belongs to, or `null` when nothing in it
 * is recognised — a cook of something this list has never heard of seeds
 * nothing rather than being given a temperature somebody else's meat is done at.
 */
export const matchMeatCategory = (
  meatType: string | null | undefined,
): MeatCategory | null => {
  const text = (meatType ?? '').toLowerCase();
  const matching = (words: Record<MeatCategory, readonly string[]>) =>
    MEAT_CATEGORIES.find((category) =>
      words[category].some((keyword) => namesCut(text, keyword)),
    );
  return matching(CATEGORY_ANIMALS) ?? matching(CATEGORY_CUTS) ?? null;
};

/**
 * Whether a preset may be applied to this probe: it is being watched, and its
 * target is still whatever the app put there rather than one the user typed.
 */
const seedable = (probe: ProbeTargetEntry): boolean =>
  probe.enabled && probe.targetSource !== 'user';

/**
 * The probe rows as they stand once the default target for `meatType` has been
 * applied to them — or `null` when that changes nothing, so a caller has
 * nothing to write.
 *
 * Only a watched probe whose target nobody set by hand is touched. A
 * temperature the user typed is theirs, and a probe they are not watching is a
 * row they switched off; overwriting either would be the app disagreeing with
 * the person standing at the smoker.
 */
export const withSeededTargets = (
  probes: ProbeTargetEntry[],
  presets: TargetPresets,
  meatType: string | null | undefined,
): ProbeTargetEntry[] | null => {
  const category = matchMeatCategory(meatType);
  if (!category) {
    return null;
  }

  const preset = presets[category];
  const seeded = probes.map((probe) =>
    seedable(probe)
      ? { ...probe, target: preset, targetSource: 'preset' as const }
      : probe,
  );
  const changed = seeded.some(
    (probe, index) =>
      probe.target !== probes[index].target ||
      probe.targetSource !== probes[index].targetSource,
  );
  return changed ? seeded : null;
};
