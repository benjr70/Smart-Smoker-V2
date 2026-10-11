import { DEFAULT_STAMPS } from '../api/cookStamps';
import { extractionRequestFor } from './extractionRequest';
import { SCREEN_FIELDS, toolSchemaFor } from './fieldDefinition';
import type { ExtractionContext } from './ports';

const TRANSCRIPT = 'Sixteen pound brisket. Trimmed the fat cap.';

/** Everything a Ramble could be read against, whichever screen it is spoken on. */
const context: ExtractionContext = {
  now: new Date(2026, 9, 3, 15, 5),
  probeNames: ['Flat', '', 'Point'],
  enabledStamps: DEFAULT_STAMPS,
};

const MEAT_SUGGESTIONS = 'Brisket, Ribs, Pork Shoulder';
const WOOD_SUGGESTIONS = 'Hickory, Post Oak, Pecan';
const PROBE_NAMES = 'probe 1 is "Flat", probe 3 is "Point"';
const STAMP_NAMES = 'wrap ("Wrapped")';

/** The whole of what the model is given, as one text to look through. */
const told = (request: ReturnType<typeof extractionRequestFor>): string =>
  [request.system, request.user, JSON.stringify(request.tool).replace(/\\"/g, '"')].join('\n');

describe('what the model is asked for a Ramble', () => {
  it('is the transcript, the current time and one tool: the pre-smoke screen’s', () => {
    const request = extractionRequestFor('preSmoke', TRANSCRIPT, context);

    expect(request.user).toContain(TRANSCRIPT);
    expect(request.user).toContain('Saturday, October 3, 2026 at 3:05 PM');
    expect(request.tool).toEqual(toolSchemaFor('preSmoke', context));
    expect(request.system).toContain('fill_pre_smoke');
  });

  it('carries the meat suggestions on the pre-smoke screen, and nothing of the smoke screen', () => {
    const asked = told(extractionRequestFor('preSmoke', TRANSCRIPT, context));

    expect(asked).toContain(MEAT_SUGGESTIONS);
    expect(asked).not.toContain(WOOD_SUGGESTIONS);
    expect(asked).not.toContain('Flat');
    expect(asked).not.toContain('Wrapped');
  });

  it('carries the wood suggestions, probe names and enabled stamps on the smoke screen', () => {
    const request = extractionRequestFor('smoke', TRANSCRIPT, {
      ...context,
      enabledStamps: DEFAULT_STAMPS.map(stamp => ({ ...stamp, enabled: stamp.key !== 'vent' })),
    });
    const asked = told(request);

    expect(request.system).toContain('fill_smoke');
    expect(asked).toContain(WOOD_SUGGESTIONS);
    expect(asked).toContain(PROBE_NAMES);
    expect(asked).toContain(STAMP_NAMES);
    // A stamp the cook log does not offer is not one the model can pick.
    expect(asked).not.toContain('Vent');
    expect(asked).not.toContain(MEAT_SUGGESTIONS);
  });

  it('carries no suggestion list, probe name or stamp on the post-smoke screen', () => {
    const asked = told(extractionRequestFor('postSmoke', TRANSCRIPT, context));

    expect(asked).toContain('fill_post_smoke');
    expect(asked).not.toContain(MEAT_SUGGESTIONS);
    expect(asked).not.toContain(WOOD_SUGGESTIONS);
    expect(asked).not.toContain('Flat');
    expect(asked).not.toContain('Wrapped');
  });

  it.each(['preSmoke', 'smoke', 'postSmoke'] as const)(
    'asks only for the fields of the %s screen',
    screen => {
      const request = extractionRequestFor(screen, TRANSCRIPT, context);

      expect(Object.keys(request.tool.parameters.properties)).toEqual(
        SCREEN_FIELDS[screen].fields.map(field => field.key)
      );
      expect(request.tool.parameters).not.toHaveProperty('required');
    }
  );

  it('carries the existing Notes it is given, to be merged', () => {
    const request = extractionRequestFor('postSmoke', TRANSCRIPT, {
      ...context,
      existingNotes: 'Bark set early.',
    });

    expect(request.user).toContain('Existing notes:\n"""\nBark set early.\n"""');
  });

  it('says nothing of existing Notes when it is given none', () => {
    const request = extractionRequestFor('postSmoke', TRANSCRIPT, context);

    expect(request.user).not.toContain('Existing notes');
  });

  it('tells the model the time on every screen, morning and midnight alike', () => {
    const at = (now: Date) => extractionRequestFor('smoke', TRANSCRIPT, { now }).user;

    expect(at(new Date(2026, 0, 4, 0, 7))).toContain('Sunday, January 4, 2026 at 12:07 AM');
    expect(at(new Date(2026, 0, 4, 12, 0))).toContain('Sunday, January 4, 2026 at 12:00 PM');
  });
});
