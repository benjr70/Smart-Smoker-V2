/**
 * What a model that answers through one tool call is asked for a Ramble: what
 * it is told it is doing, the Ramble itself, and the one tool it answers with.
 *
 * All of it is of the screen the Ramble was spoken on and of no other. The
 * tool is that screen's fields, derived from the per-screen field definition,
 * and carries with them the screen's suggestion lists and — on the smoke
 * screen — the names its probes go by and the stamps its cook log offers. The
 * Notes text is one of the tool's fields, so one call to the model answers the
 * whole Ramble.
 *
 * Nothing here knows which runtime asks: an adapter hands these three to its
 * model in whatever shape that model takes them.
 */
import type { VoiceFillScreen, VoiceFillToolSchema } from './fieldDefinition';
import { SCREEN_FIELDS, toolSchemaFor } from './fieldDefinition';
import type { ExtractionContext } from './ports';

export interface ExtractionRequest {
  /** What the model is told it is doing, and how it is to answer. */
  system: string;
  /** This Ramble: when it was spoken, the Notes to merge, and what was said. */
  user: string;
  /** The one tool the model answers by calling: the screen's fields. */
  tool: VoiceFillToolSchema;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * `Saturday, October 3, 2026 at 3:05 PM`: the phone's own time, written out so
 * that the weekday and the half of the day need no working out. Spelled here
 * and not left to the browser's locale, so every phone tells the model the same.
 */
const timeTold = (now: Date): string => {
  const hour = now.getHours() % 12 || 12;
  const minute = String(now.getMinutes()).padStart(2, '0');
  const half = now.getHours() < 12 ? 'AM' : 'PM';
  return (
    `${WEEKDAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ` +
    `${now.getFullYear()} at ${hour}:${minute} ${half}`
  );
};

/** A text the model is given whole, fenced off from what it is told about it. */
const quoted = (text: string): string => `"""\n${text.trim()}\n"""`;

/** What a model is asked for a Ramble spoken on `screen`. */
export const extractionRequestFor = (
  screen: VoiceFillScreen,
  transcript: string,
  context: ExtractionContext
): ExtractionRequest => {
  const tool = toolSchemaFor(screen, context);
  const { title } = SCREEN_FIELDS[screen];
  const notes = context.existingNotes?.trim();
  return {
    system:
      `You fill in the ${title} screen of a barbecue smoking log from what the cook said ` +
      `aloud. Answer by calling ${tool.name} exactly once and say nothing else. Give only ` +
      'the fields the cook mentioned and leave out every other one. Never invent a value. ' +
      'Keep names as they were spoken. Whatever was said that fits no other field goes ' +
      'into notes, as clean sentences and not as a copy of the words spoken.',
    user: [
      `Current time: ${timeTold(context.now)}`,
      ...(notes ? [`Existing notes:\n${quoted(notes)}`] : []),
      `What the cook said:\n${quoted(transcript)}`,
    ].join('\n\n'),
    tool,
  };
};
