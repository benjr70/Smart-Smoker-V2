/**
 * Shared frontend API domain (wire) types.
 *
 * This module is the single place API domain types live so that services never
 * import types from React components. Additional resource types are added here
 * as each migration slice lands.
 */
import { TempData } from 'temperaturechart/src/tempChart';
import type { WeightUnits } from '../components/common/interfaces/enums';
import type { StampTone } from './cookStamps';

export type { TempData };

/**
 * A smoke profile as seen by the frontend.
 *
 * The optional-on-the-wire `notes` and `woodType` fields are normalized to
 * empty strings inside the client's read path, so this domain type declares
 * them **non-optional**: callers never have to guard for `undefined`.
 */
export interface SmokeProfile {
  chamberName: string;
  probe1Name: string;
  probe2Name: string;
  probe3Name: string;
  notes: string;
  woodType: string;
}

/**
 * Pre-smoke domain type. Canonical here (the definition was relocated from the
 * component interface tree in the final cutover), so the client and every caller
 * import it from the API types module rather than reaching into a component.
 */
export interface PreSmoke {
  name?: string;
  meatType?: string;
  weight: {
    weight?: number;
    unit?: WeightUnits;
  };
  steps: string[];
  notes?: string;
}

/**
 * Post-smoke domain type. Canonical here (relocated from the React step
 * component in an earlier slice) so the service/client layer never imports a
 * domain type from a component.
 */
export interface PostSmoke {
  restTime: string;
  steps: string[];
  notes?: string;
}

/**
 * A smoke rating. Canonical here (relocated from the component interface tree in
 * the final cutover) so API call sites depend only on the API types module. The
 * persisted `_id` rides along on a fetched document and is stripped before the
 * outbound DTO is sent (see the client's ratings save projection).
 */
export interface rating {
  smokeFlavor: number;
  seasoning: number;
  tenderness: number;
  overallTaste: number;
  notes: string;
  _id?: string;
}

/**
 * The chamber Temperature Alert: whether it is on, and the range the chamber is
 * expected to hold. The alert stays silent until the chamber first reaches this
 * range, so the bounds describe the cook, not the preheat.
 */
export interface ChamberAlertSettings {
  enabled: boolean;
  low: number;
  high: number;
}

/**
 * One probe's row in the Probe Target Reached alert.
 *
 * Stored by `slot` and never by name, because a slot outlives a cook. `name` is
 * the display name the backend resolves from the active cook's smoke profile and
 * serves on the read — falling back to a generic slot label when nothing is set
 * up or the cook left that probe unnamed. It rides along on the read only; the
 * client's save projection strips it, and the backend rejects a save carrying it.
 */
export interface ProbeTargetEntry {
  slot: string;
  /** Whether this probe is being watched. */
  enabled: boolean;
  /** The temperature, °F, this probe's meat is done at. */
  target: number;
  /**
   * Where that target came from. A row marked `user` is one somebody typed a
   * temperature into, and the backend never seeds over it when a cook starts —
   * so the settings page marks the row it edits rather than leaving the backend
   * to guess from a number that looks exactly like the default.
   */
  targetSource: TargetSource;
  /**
   * How many minutes before this probe reaches its target the cook wants to be
   * warned, or `null` for not at all.
   *
   * On the probe row rather than in a list of its own, because it is about the
   * same probe reaching the same target this row already describes — the global
   * switch below only decides whether any of it is heard.
   */
  leadMinutes: number | null;
  name: string;
}

/** Where a probe's target came from: shipped, seeded from a preset, or typed. */
export type TargetSource = 'default' | 'preset' | 'user';

/**
 * The default target temperature, °F, per meat category — what the backend puts
 * on the watched probes when a cook whose meat matches that category starts.
 */
export interface TargetPresets {
  beef: number;
  pork: number;
  poultry: number;
}

/** The Probe Target Reached alert: switched on as a whole, plus a row per probe. */
export interface ProbeTargetAlertSettings {
  enabled: boolean;
  probes: ProbeTargetEntry[];
}

/**
 * The Smoke Complete alert: told once, when every probe being watched has
 * reached its target.
 *
 * Only a switch, because the cook it describes is the probe watch list above —
 * a second description of "done" here could only disagree with that one. It is
 * deliberately not tied to the finish action: the person pressing Finish
 * already knows they pressed it.
 */
export interface SmokeCompleteAlertSettings {
  enabled: boolean;
}

/**
 * The heads-up alert: told before the meat is done, in time to do something
 * about it.
 *
 * Only a switch, because how long before is per probe and lives on the rows
 * above — a second copy of it here could only disagree with the row the user is
 * looking at.
 */
export interface HeadsUpAlertSettings {
  enabled: boolean;
}

/**
 * The notification settings document. Canonical here so API call sites depend
 * only on the API types module.
 *
 * It carries only what the user configures — the armed flags and fired markers
 * the server keeps while evaluating alerts live in a document of their own, and
 * never ride along on a save from the settings page. A document read back from
 * the backend also carries a persisted `_id`/`__v`, which the client's save
 * projection strips.
 */
export interface NotificationSettings {
  chamber: ChamberAlertSettings;
  probeTarget: ProbeTargetAlertSettings;
  smokeComplete: SmokeCompleteAlertSettings;
  headsUp: HeadsUpAlertSettings;
  /**
   * The Default target temps card's block. It rides on the same read as the
   * alerts because it is the same document, but it is saved on its own — see
   * the notifications resource's `saveTargetPresets`.
   */
  targetPresets: TargetPresets;
}

/** The colour schemes the application can render in. */
export type ColorScheme = 'light' | 'dark';

/** What an operator can ask for: a fixed scheme, or "follow the device". */
export type AppearanceMode = ColorScheme | 'system';

/**
 * The installation-wide appearance preference as it goes over the wire: the
 * mode that was chosen, and what that choice resolved to on the client that
 * last wrote it.
 *
 * The resolved half is stored because a client with no colour preference of its
 * own cannot resolve "follow the device" — the touchscreen's browser reports
 * light whatever the garage looks like, so it reads this value instead of
 * asking. Declared here, alongside the other wire types, so the client and its
 * callers never import a domain type from the theme package through the API
 * layer; it is structurally the preference the shared appearance resolver reads
 * and writes.
 */
export interface AppearancePreference {
  mode: AppearanceMode;
  resolvedMode: ColorScheme;
}

/**
 * When a cook nobody ended is taken to be over: its readings have stopped for
 * this many hours.
 *
 * A block rather than a bare number because the settings document is saved
 * block by block by several independent cards — a card that had to carry a
 * loose field would be carrying the whole document, and would undo whatever the
 * card beside it had just saved.
 */
export interface AutoStopSettings {
  idleHours: number;
}

/**
 * The application settings document: everything the installation configures,
 * whether or not it has anything to do with notifications.
 */
export interface ApplicationSettings {
  chamber: ChamberAlertSettings;
  probeTarget: ProbeTargetAlertSettings;
  smokeComplete: SmokeCompleteAlertSettings;
  headsUp: HeadsUpAlertSettings;
  targetPresets: TargetPresets;
  appearance: AppearancePreference;
  autoStop: AutoStopSettings;
}

/**
 * The central smoke-session state singleton as seen by the frontend: which
 * smoke is current and whether it is actively smoking. Canonical here so
 * services and the client never import domain types from React land.
 */
export interface State {
  smokeId: string;
  smoking: boolean;
}

/**
 * The smoke aggregate root: a smoke owns its child documents by id
 * (pre-smoke, temperature series, post-smoke, profile, rating) plus its date
 * and lifecycle status. Mirrors the backend `Smoke` schema. Child ids are the
 * seam through which the delete cascade and review reads resolve the pieces.
 */
export interface Smoke {
  _id?: string;
  preSmokeId: string;
  tempsId: string;
  postSmokeId: string;
  smokeProfileId: string;
  ratingId: string;
  date: Date;
  status: number;
}

/**
 * A cook's timing and extremes, as the backend derives them: when it started
 * and finished, how long it ran, how hot it ever got, and what it was being
 * taken to.
 *
 * Every field is nullable because a cook recorded before the stamps existed —
 * or one that kept no readings at all — genuinely has no such number, and the
 * screens render that absence as an em-dash. The two stamps are `Date`s here
 * rather than the ISO strings the wire carries: the client's read path converts
 * them, so nothing downstream subtracts one string from another.
 */
export interface SmokeTimeline {
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  peakChamber: number | null;
  peakMeat: number | null;
  targetTemp: number | null;
}

/**
 * How the cook in progress is going, as the backend judges it: warming up, on
 * track, stalled, off the heat, or done — and `null` when no probe is being
 * watched, so there is nothing to be going towards at all.
 */
export type CompletionState = 'warming' | 'ok' | 'stalled' | 'paused' | 'done';

/**
 * When the cook in progress will be done, derived server-side on every read.
 *
 * Nullable throughout, and for two different reasons the card tells apart by the
 * state: a `warming` cook has no numbers *yet*, while a `null` state means no
 * probe is being watched and there is nothing to estimate towards.
 *
 * `eta` is a `Date` here rather than the ISO string the wire carries, converted
 * in the client's read path for the same reason the timeline's stamps are: the
 * card formats it as a clock time, and formatting a string is a card reading
 * "Invalid Date" to whoever is planning dinner around it.
 */
export interface CompletionEstimate {
  state: CompletionState | null;
  /** When the meat is expected to reach its target. */
  eta: Date | null;
  /** How long that is from now, in hours. */
  hoursRemaining: number | null;
  /** How fast the meat is climbing, °F/hr. */
  ratePerHour: number | null;
  /** How far it has come from where it started, as a percentage. */
  progressPercent: number | null;
  /** The first reading of the cook on the watched probe, °F. */
  startTemp: number | null;
  /** What the watched probe is set to be done at, °F. */
  targetTemp: number | null;
}

/** The cook in progress: its timeline so far, and where it is going. */
export interface CurrentSmokeTimeline extends SmokeTimeline {
  estimate: CompletionEstimate;
}

/**
 * The composed review read-model: a smoke parent plus its five resolved child
 * resources, the shape the history review screen renders. The deep client's
 * review-aggregate call fetches the parent, then the children in parallel, and
 * fills any absent piece with a typed default so a single missing child never
 * fails the whole read. Every field is non-optional: callers render it without
 * per-piece guards.
 */
export interface SmokeReview {
  smoke: Smoke;
  /**
   * The cook's timing, derived server-side. `null` when the backend could not
   * be asked for it — the review still renders, with its timing fields blank,
   * rather than the whole screen failing over one absent piece.
   */
  timeline: SmokeTimeline | null;
  preSmoke: PreSmoke;
  smokeProfile: SmokeProfile;
  temps: TempData[];
  postSmoke: PostSmoke;
  rating: rating;
}

/**
 * A history row: the denormalized summary the history list renders per smoke.
 * Canonical here so the client's history read stays free of component imports.
 */
export interface SmokeHistory {
  name: string;
  meatType: string;
  weight: string;
  weightUnit: string;
  woodType: string;
  date: string;
  smokeId: string;
  overAllRating: string;
  /**
   * How long the cook ran, in milliseconds, or `null` when nothing recorded
   * enough to say. The card renders the absence as an em-dash.
   */
  durationMs: number | null;
  /**
   * Everything written about the cook — its pre-smoke, smoke, post-smoke and
   * review notes — with the stages nobody wrote anything for left out.
   *
   * The list never shows them; the search reads them, because the word a user
   * remembers ("spritzed") was typed on a screen they do not remember.
   */
  notes: string[];
}

/**
 * A browser push subscription as it goes over the wire to
 * `notifications/subscribe` — the JSON form of the browser's `PushSubscription`
 * (`subscription.toJSON()`), which is exactly what the backend stores.
 */
export interface PushSubscriptionPayload {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * One personal record: the cook that holds it, and the number it holds it with.
 *
 * The value is raw — milliseconds, pounds, °F, a 0–10 score — because how a
 * record reads is the screen's business, not the wire's.
 */
export interface StatRecord {
  smokeId: string;
  /** The cook's name, or — for an unnamed cook — its meat and its day. */
  label: string;
  /** ISO, or `null` for a cook with no date recorded. */
  date: string | null;
  value: number;
}

/** How much of one meat has been cooked, and how often. */
export interface MeatStat {
  meatType: string;
  sessions: number;
  pounds: number;
}

/** How often one wood has been burned. */
export interface WoodStat {
  woodType: string;
  sessions: number;
}

/**
 * Everything the Stats screen shows, derived server-side.
 *
 * Every aggregate is nullable, and all of them are `null` for an archive with
 * nothing completed in it: a user who has never finished a cook has not cooked
 * for zero hours, they have no average at all. `totalSessions` is the one
 * figure that is always a number, and it is what tells the screen whether it is
 * looking at statistics or at an empty archive.
 */
export interface Stats {
  totalSessions: number;
  /** Time on the smoker across every cook whose length is known, ms. */
  totalCookMs: number | null;
  totalPounds: number | null;
  approximateServings: number | null;
  /** Mean overall-taste score across the cooks that were rated, 0–10. */
  averageRating: number | null;
  averageCookMs: number | null;
  totalRestMs: number | null;
  woodTypeCount: number;
  meatTypeCount: number;
  records: {
    highestRated: StatRecord | null;
    longestCook: StatRecord | null;
    heaviestCut: StatRecord | null;
    /** `null` until finished cooks carry a stamped chamber peak. */
    hottestChamber: StatRecord | null;
  };
  /** Per-meat totals, most-cooked first. */
  byMeat: MeatStat[];
  /** Per-wood totals, most-burned first. */
  byWood: WoodStat[];
  categoryAverages: {
    smokeFlavor: number | null;
    seasoning: number | null;
    tenderness: number | null;
    overallTaste: number | null;
  };
}

/**
 * One tap of the cook log: what was done, when, and what the pit was at.
 *
 * The moment is the server's, so a phone and a touchscreen cannot disagree
 * about the order things happened in; the four temperatures are the snapshot
 * the backend took from the newest reading, and any of them may be `null` when
 * the probe reported nothing (a cook stamped before its first reading, an
 * unplugged probe).
 *
 * `label` and `tone` are the snapshot taken when the stamp was tapped. A
 * client renders the catalogue's current label for a key it still knows and
 * falls back to these, which is what keeps a removed custom stamp legible.
 */
export interface CookEvent {
  _id: string;
  smokeId: string;
  stampKey: string;
  label: string;
  tone: StampTone;
  /** Converted from the wire's ISO string in the client's read path. */
  at: Date;
  chamberTemp: number | null;
  probe1Temp: number | null;
  probe2Temp: number | null;
  probe3Temp: number | null;
}
