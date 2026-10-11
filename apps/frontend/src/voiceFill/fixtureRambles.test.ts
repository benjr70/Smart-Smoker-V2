/**
 * The fixture Rambles, held to the extraction contract.
 *
 * The real-phone bar is marked by a person against what each fixture expects.
 * Here each fixture's ideal answer — what a model that heard the script
 * perfectly returns — is put through the contract, and what comes out has to be
 * exactly what the fixture expects: the sheet can never ask the phone for a row
 * the contract would not propose, or miss one it would.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { notesAreMerged, reviewRows } from './extractionContract';
import { FIXTURE_RAMBLES, FixtureRamble, LONG_SHORT_NOTES } from './fixtureRambles';

/** The rows a fixture's ideal answer proposes, whichever screen it is read on. */
const rowsOf = (fixture: FixtureRamble): { id: string; field: string; newValue: unknown }[] => {
  switch (fixture.screen) {
    case 'preSmoke':
      return reviewRows('preSmoke', fixture.ideal, fixture.before, fixture.context);
    case 'smoke':
      return reviewRows('smoke', fixture.ideal, fixture.before, fixture.context);
    default:
      return reviewRows('postSmoke', fixture.ideal, fixture.before, fixture.context);
  }
};

/** A text as it is compared with the run sheet's: its words, however they are wrapped. */
const unwrapped = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * The run sheet as its words: what is quoted on it is wrapped by the formatter
 * with a mark at the head of every line, which is no part of what is read.
 */
const RUN_SHEET = unwrapped(
  readFileSync(join(__dirname, 'fixtureRambles.md'), 'utf8').replace(/^> ?/gm, '')
);

describe('the fixture Rambles', () => {
  it('are nine, three for each screen, each under an id of its own', () => {
    const screens = FIXTURE_RAMBLES.map(fixture => fixture.screen);

    expect(FIXTURE_RAMBLES).toHaveLength(9);
    expect(new Set(FIXTURE_RAMBLES.map(fixture => fixture.id)).size).toBe(9);
    (['preSmoke', 'smoke', 'postSmoke'] as const).forEach(screen =>
      expect(screens.filter(read => read === screen)).toHaveLength(3)
    );
  });

  describe.each(FIXTURE_RAMBLES.map(fixture => [fixture.id, fixture] as const))(
    '%s',
    (_id, fixture) => {
      const rows = rowsOf(fixture);

      it('expects every structured row the contract proposes, and no other', () => {
        const structured = rows.filter(row => row.field !== 'notes');

        expect(Object.fromEntries(structured.map(row => [row.id, row.newValue]))).toEqual(
          fixture.expected
        );
      });

      it('expects a Notes row exactly where the contract proposes one', () => {
        expect(rows.some(row => row.field === 'notes')).toBe(fixture.notes !== null);
      });

      it('is written out on the run sheet, word for word', () => {
        expect(RUN_SHEET).toContain(`### ${fixture.id}`);
        expect(RUN_SHEET).toContain(unwrapped(fixture.script));
      });
    }
  );

  it('reads the heaviest merge onto Notes long enough to be work and short enough to be merged', () => {
    expect(LONG_SHORT_NOTES.split(/\s+/).length).toBeGreaterThanOrEqual(100);
    expect(notesAreMerged(LONG_SHORT_NOTES)).toBe(true);
    expect(RUN_SHEET).toContain(LONG_SHORT_NOTES);
  });
});
