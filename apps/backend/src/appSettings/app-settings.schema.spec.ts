/**
 * The stored settings as Mongoose itself hands them back.
 *
 * Every other test around this document feeds plain objects to a stand-in
 * model, which cannot show what the schema puts on a row while hydrating it —
 * and that gap hides real bugs. A `default` on the provenance field makes a row
 * stored before provenance existed claim it has one, so nothing downstream can
 * tell a hand-typed target from an untouched default and seeding overwrites the
 * user's own temperature. These tests hydrate real documents, which needs no
 * database: hydration applies the schema's defaults on its own.
 */
import { model } from 'mongoose';
import { withSettingsDefaults } from './app-settings.defaults';
import {
  ApplicationSettings,
  ApplicationSettingsSchema,
} from './app-settings.schema';
import { withSeededTargets } from './meat-presets';

const StoredSettings = model(
  'ApplicationSettingsHydrationSpec',
  ApplicationSettingsSchema,
);

/**
 * The settings read back from a document written before provenance was
 * recorded: probe rows carrying a target and no note of where it came from.
 *
 * `hydrate` is the read path itself — it is what a `findOne` does to the raw
 * document Mongo answers with.
 */
const readingLegacyDocument = (target: number): ApplicationSettings =>
  withSettingsDefaults(
    StoredSettings.hydrate({
      probeTarget: {
        enabled: true,
        probes: [{ slot: 'probe1', enabled: true, target }],
      },
    }) as unknown as ApplicationSettings,
  );

describe('the settings document read back through Mongoose', () => {
  describe('a probe target stored before provenance was recorded', () => {
    // A row nobody could have got to 145°F except by typing it. The shipped
    // default is 203°F, so an installation upgrading into preset seeding must
    // read this as the user's own or the next pork cook silently replaces it.
    it('reads a target that is not the shipped default as the user’s own', () => {
      expect(readingLegacyDocument(145).probeTarget.probes[0]).toEqual({
        slot: 'probe1',
        enabled: true,
        target: 145,
        targetSource: 'user',
      });
    });

    // Nothing distinguishes a row left on the shipped 203°F from one nobody
    // ever opened, so it stays seedable and an upgraded installation still gets
    // the presets.
    it('reads a target still on the shipped default as untouched', () => {
      expect(readingLegacyDocument(203).probeTarget.probes[0]).toEqual({
        slot: 'probe1',
        enabled: true,
        target: 203,
        targetSource: 'default',
      });
    });

    // The consequence the provenance exists for: a pork loin taken to 145°F by
    // hand, on an installation that has just upgraded, survives the pork cook
    // it was typed for.
    it('is not seeded over when the session starts', () => {
      const upgraded = readingLegacyDocument(145);

      expect(
        withSeededTargets(
          upgraded.probeTarget.probes,
          upgraded.targetPresets,
          'Pork shoulder',
        ),
      ).toBeNull();
    });
  });

  // Provenance is inferred only for rows that predate it. Once a row has been
  // saved it says what it is, so a preset-seeded target that happens to equal
  // the shipped default is still the app's to replace on the next cook.
  it('reads back the provenance a saved row carries', () => {
    const stored = withSettingsDefaults(
      StoredSettings.hydrate({
        probeTarget: {
          enabled: true,
          probes: [
            {
              slot: 'probe1',
              enabled: true,
              target: 203,
              targetSource: 'preset',
            },
            {
              slot: 'probe2',
              enabled: true,
              target: 203,
              targetSource: 'user',
            },
          ],
        },
      }) as unknown as ApplicationSettings,
    );

    expect(
      stored.probeTarget.probes.map((probe) => probe.targetSource),
    ).toEqual(['preset', 'user', 'default']);
  });
});
