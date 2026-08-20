import { StatsDto } from './stats.dto';

/**
 * One cook, joined: everything the five collections of a session say about it,
 * flattened into the handful of facts the statistics are derived from.
 *
 * Every field is nullable because every one of them is: a cook may have been
 * logged without a weight, without a wood, without a name, without ever being
 * rated, and — for cooks recorded before the timestamps existed — without a
 * length that could be derived at all.
 */
export interface CookRecord {
  smokeId: string;
  /** Whether the cook is finished. Unfinished cooks are invisible to stats. */
  completed: boolean;
  date: Date | null;
  name: string | null;
  meatType: string | null;
  /** As it was weighed, in `weightUnit` — not normalized. */
  weight: number | null;
  weightUnit: string | null;
  woodType: string | null;
  /** Free text, as it was typed. See {@link parseRestMs}. */
  restTime: string | null;
  durationMs: number | null;
  peakChamber: number | null;
  ratings: {
    smokeFlavor: number | null;
    seasoning: number | null;
    tenderness: number | null;
    overallTaste: number | null;
  } | null;
}

/** What a pound is, in each unit a cut may have been weighed in. */
const POUNDS_PER_UNIT: Record<string, number> = {
  LB: 1,
  OZ: 1 / 16,
  KG: 2.20462,
};

/** How many people a pound of finished meat is taken to feed. */
const SERVINGS_PER_POUND = 2.5;

/** The archive of a user who has never finished a cook. */
const EMPTY_ARCHIVE: StatsDto = {
  totalSessions: 0,
  totalCookMs: null,
  totalPounds: null,
  approximateServings: null,
  averageRating: null,
  averageCookMs: null,
  totalRestMs: null,
  woodTypeCount: 0,
  meatTypeCount: 0,
  records: {
    highestRated: null,
    longestCook: null,
    heaviestCut: null,
    hottestChamber: null,
  },
  byMeat: [],
  byWood: [],
  categoryAverages: {
    smokeFlavor: null,
    seasoning: null,
    tenderness: null,
    overallTaste: null,
  },
};

/**
 * What a cut weighed, in pounds, whatever it was weighed in.
 *
 * A cut nobody weighed weighs nothing — the session still counts, it simply
 * adds no pounds — and so does one weighed in a unit this does not know, which
 * is the same admission rather than a guess at which unit was meant.
 */
const poundsOf = (record: CookRecord): number => {
  if (record.weight === null || !Number.isFinite(record.weight)) {
    return 0;
  }
  const unit = (record.weightUnit ?? 'LB').trim().toUpperCase();
  const factor = POUNDS_PER_UNIT[unit];
  return factor === undefined ? 0 : record.weight * factor;
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** The wizard's own shape: `01:30`. */
const COLON_REST = /^(\d{1,3}):([0-5]?\d)$/;
/** A rest written in words or suffixes: `1h 30m`, `2 hours`, `45 minutes`. */
const SUFFIXED_REST =
  /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?$/;
/** A rest written as a number and nothing else. */
const BARE_REST = /^\d+(?:\.\d+)?$/;

/**
 * How long a cook rested, in milliseconds, from whatever was typed into a free
 * text box.
 *
 * The field has never been validated, so the archive holds every shape a person
 * reaches for: the wizard's `01:30`, `1h 30m`, `2 hours`, `45m`, and — most
 * often — a bare number, which is read as minutes because that is what somebody
 * typing one number about resting meat means.
 *
 * Anything else rests for no time at all. That is the honest reading: a total
 * is a sum of times, and a phrase that names no length cannot be guessed into
 * one without inventing hours the user never rested.
 */
export const parseRestMs = (restTime: string | null): number => {
  const written = (restTime ?? '').trim().toLowerCase();
  if (written === '') {
    return 0;
  }

  const colon = COLON_REST.exec(written);
  if (colon) {
    return Number(colon[1]) * HOUR_MS + Number(colon[2]) * MINUTE_MS;
  }

  if (BARE_REST.test(written)) {
    return Number(written) * MINUTE_MS;
  }

  const suffixed = SUFFIXED_REST.exec(written);
  if (suffixed && (suffixed[1] !== undefined || suffixed[2] !== undefined)) {
    return (
      Number(suffixed[1] ?? 0) * HOUR_MS + Number(suffixed[2] ?? 0) * MINUTE_MS
    );
  }

  return 0;
};

/** A number rounded to `places` decimals, so totals do not read as float noise. */
const round = (value: number, places = 1): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

/**
 * The mean of the numbers there are, or `null` when there are none.
 *
 * Null rather than zero throughout: "no cook has been rated" and "every cook
 * scored nothing" are different facts about an archive, and only one of them is
 * an insult.
 */
const mean = (values: number[], places = 1): number | null =>
  values.length === 0
    ? null
    : round(values.reduce((a, b) => a + b, 0) / values.length, places);

/**
 * A score somebody actually gave, or `null`.
 *
 * A rating of zero is read as unrated rather than as the worst cook ever made:
 * every slider on the ratings screen starts at zero, so a cook that was archived
 * without the screen being touched carries four of them, and averaging those in
 * would drag a user's scores down for every cook they never got round to
 * rating. The history list already reads a zero the same way.
 */
const scoreOf = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;

/** Every score given in one rating category, across the archive. */
const scoresIn = (
  cooks: CookRecord[],
  category: keyof NonNullable<CookRecord['ratings']>,
): number[] =>
  cooks
    .map((cook) => scoreOf(cook.ratings?.[category]))
    .filter((score): score is number => score !== null);

/**
 * A tally of one freehand-typed name: how many cooks used it, how much meat
 * they carried, and every spelling anybody wrote it with.
 */
interface SpellingUse {
  count: number;
  /** The most recent cook that wrote it this way. */
  moment: number;
  /** Its position in the archive, so two cooks of one moment still order. */
  order: number;
}

interface Tally {
  sessions: number;
  pounds: number;
  /** Each spelling written, how often, and the last cook to use it. */
  spellings: Map<string, SpellingUse>;
}

/** When a cook happened, for ordering; an undated cook is the oldest there is. */
const momentOf = (cook: CookRecord): number => cook.date?.getTime() ?? 0;

/**
 * Counts freehand names, ignoring the differences a user does not mean.
 *
 * "Brisket", "brisket" and " Brisket " are one meat: names are compared with
 * their surrounding space removed and their case folded away. What the screen
 * is told to call the group is the spelling written most often — the user's own
 * habit, rather than whichever cook happened to be logged first. Two spellings
 * written equally often are settled the way a tied record is: the more recent
 * cook's spelling wins, so a user who changes how they write a name sees the
 * change take.
 *
 * A cook that named nothing is counted under no name at all; a blank would
 * otherwise become a group of its own and be presented as a kind of meat.
 */
const tally = (
  cooks: CookRecord[],
  nameOf: (cook: CookRecord) => string | null,
): Map<string, Tally> => {
  const groups = new Map<string, Tally>();
  cooks.forEach((cook, order) => {
    const written = (nameOf(cook) ?? '').trim();
    if (written === '') {
      return;
    }
    const key = written.toLowerCase();
    const group = groups.get(key) ?? {
      sessions: 0,
      pounds: 0,
      spellings: new Map<string, SpellingUse>(),
    };
    group.sessions += 1;
    group.pounds += poundsOf(cook);
    const spelling = group.spellings.get(written);
    group.spellings.set(written, {
      count: (spelling?.count ?? 0) + 1,
      moment: Math.max(spelling?.moment ?? 0, momentOf(cook)),
      order,
    });
    groups.set(key, group);
  });
  return groups;
};

/** The spelling a group is presented under: the one written most often. */
const preferredSpelling = (group: Tally): string =>
  [...group.spellings.entries()].reduce((best, entry) =>
    entry[1].count > best[1].count ||
    (entry[1].count === best[1].count &&
      (entry[1].moment > best[1].moment ||
        (entry[1].moment === best[1].moment && entry[1].order > best[1].order)))
      ? entry
      : best,
  )[0];

/** Month names, so a fallback label reads the same wherever the server runs. */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * What to call a cook on a record row.
 *
 * Most cooks are never named — the wizard does not insist on one — and a record
 * row headed by an empty string is a prize awarded to nobody. Such a cook is
 * introduced the way its owner would introduce it: what it was, and when.
 *
 * The day is read in UTC rather than in the server's zone so that the same
 * archive reads the same wherever it is deployed.
 */
const labelOf = (cook: CookRecord): string => {
  const named = (cook.name ?? '').trim();
  if (named !== '') {
    return named;
  }
  const meat = (cook.meatType ?? '').trim();
  const day =
    cook.date === null
      ? ''
      : `${
          MONTHS[cook.date.getUTCMonth()]
        } ${cook.date.getUTCDate()}, ${cook.date.getUTCFullYear()}`;
  if (meat !== '' && day !== '') {
    return `${meat} · ${day}`;
  }
  return meat || day || 'Unnamed cook';
};

/**
 * The cook that holds a record, or `null` when no cook has the figure at all.
 *
 * A record is only ever held by a cook that recorded the number: a peak chamber
 * nobody stamped, a weight nobody entered and a score nobody gave do not make
 * their cook the record holder with a zero. Where two cooks tie, the more
 * recent one takes it — the record a user just set is the one they want to see.
 */
const recordOf = (
  cooks: CookRecord[],
  valueOf: (cook: CookRecord) => number | null,
): StatsDto['records']['highestRated'] => {
  const held = cooks
    .map((cook) => ({ cook, value: valueOf(cook) }))
    .filter(
      (entry): entry is { cook: CookRecord; value: number } =>
        entry.value !== null,
    );
  if (held.length === 0) {
    return null;
  }
  const best = held.reduce((leader, entry) =>
    entry.value > leader.value ||
    (entry.value === leader.value &&
      momentOf(entry.cook) > momentOf(leader.cook))
      ? entry
      : leader,
  );
  return {
    smokeId: best.cook.smokeId,
    label: labelOf(best.cook),
    date: best.cook.date === null ? null : best.cook.date.toISOString(),
    value: round(best.value, 2),
  };
};

/** What a cut weighed in pounds, or `null` when nobody weighed it. */
const weighedPounds = (cook: CookRecord): number | null =>
  cook.weight === null || !Number.isFinite(cook.weight)
    ? null
    : poundsOf(cook) || null;

/**
 * The lifetime statistics of an archive of cooks.
 *
 * Pure: joined records in, the finished screen's numbers out. Every
 * normalization the archive needs — units, free-text rest, spelling, which cook
 * holds a record — happens here and nowhere else, so the read path, the stored
 * aggregate and any future caller all agree by construction.
 */
export function aggregateStats(records: CookRecord[]): StatsDto {
  const cooks = records.filter((record) => record.completed);
  if (cooks.length === 0) {
    return { ...EMPTY_ARCHIVE };
  }

  const durations = cooks
    .map((cook) => cook.durationMs)
    .filter((ms): ms is number => ms !== null && Number.isFinite(ms));
  const totalPounds = cooks.reduce((sum, cook) => sum + poundsOf(cook), 0);
  const meats = tally(cooks, (cook) => cook.meatType);
  const woods = tally(cooks, (cook) => cook.woodType);

  return {
    ...EMPTY_ARCHIVE,
    totalSessions: cooks.length,
    totalCookMs:
      durations.length === 0 ? null : durations.reduce((a, b) => a + b, 0),
    totalPounds: round(totalPounds),
    approximateServings: Math.round(totalPounds * SERVINGS_PER_POUND),
    averageRating: mean(scoresIn(cooks, 'overallTaste')),
    averageCookMs: mean(durations, 0),
    totalRestMs: cooks.reduce((sum, c) => sum + parseRestMs(c.restTime), 0),
    woodTypeCount: woods.size,
    meatTypeCount: meats.size,
    byMeat: [...meats.values()]
      .map((group) => ({
        meatType: preferredSpelling(group),
        sessions: group.sessions,
        pounds: round(group.pounds),
      }))
      .sort(
        (a, b) =>
          b.sessions - a.sessions ||
          b.pounds - a.pounds ||
          a.meatType.localeCompare(b.meatType),
      ),
    byWood: [...woods.values()]
      .map((group) => ({
        woodType: preferredSpelling(group),
        sessions: group.sessions,
      }))
      .sort(
        (a, b) =>
          b.sessions - a.sessions || a.woodType.localeCompare(b.woodType),
      ),
    records: {
      highestRated: recordOf(cooks, (c) => scoreOf(c.ratings?.overallTaste)),
      longestCook: recordOf(cooks, (c) =>
        c.durationMs !== null && Number.isFinite(c.durationMs)
          ? c.durationMs
          : null,
      ),
      heaviestCut: recordOf(cooks, weighedPounds),
      hottestChamber: recordOf(cooks, (c) =>
        c.peakChamber !== null && Number.isFinite(c.peakChamber)
          ? c.peakChamber
          : null,
      ),
    },
    categoryAverages: {
      smokeFlavor: mean(scoresIn(cooks, 'smokeFlavor')),
      seasoning: mean(scoresIn(cooks, 'seasoning')),
      tenderness: mean(scoresIn(cooks, 'tenderness')),
      overallTaste: mean(scoresIn(cooks, 'overallTaste')),
    },
  };
}
