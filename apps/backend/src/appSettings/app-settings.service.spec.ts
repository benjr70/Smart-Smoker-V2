import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { StateService } from '../State/state.service';
import { SmokeProfileService } from '../smokeProfile/smokeProfile.service';
import { EventsGateway } from '../websocket/events.gateway';
import {
  DEFAULT_APPLICATION_SETTINGS,
  DEFAULT_TARGET_PRESETS,
} from './app-settings.defaults';
import { ApplicationSettings } from './app-settings.schema';
import { AppSettingsService } from './app-settings.service';
import { AppearancePreference } from './appearance';
import { CookStamp, defaultStamps } from './stamp-catalogue';

/** The probe rows a deployment that has configured nothing reads back as. */
const DEFAULT_PROBE_TARGET_BLOCK = DEFAULT_APPLICATION_SETTINGS.probeTarget;

/** The Smoke Complete alert as a deployment that has configured nothing has it. */
const SMOKE_COMPLETE_OFF = DEFAULT_APPLICATION_SETTINGS.smokeComplete;

/** The heads-up alert as a deployment that has configured nothing has it. */
const HEADS_UP_OFF = DEFAULT_APPLICATION_SETTINGS.headsUp;

/** The stamps a deployment that has edited none of them offers. */
const COOK_LOG_DEFAULT = DEFAULT_APPLICATION_SETTINGS.cookLog;

/** The idle threshold a deployment that has tuned nothing auto-stops on. */
const AUTO_STOP_DEFAULT = DEFAULT_APPLICATION_SETTINGS.autoStop;

/** A target the user typed in themselves, as a row records that. */
const byHand = { targetSource: 'user', leadMinutes: null } as const;

/** A target nobody has set: the shipped default, which seeding may replace. */
const untouched = { targetSource: 'default', leadMinutes: null } as const;

/**
 * The session and the cook the probe rows are named from. A stand-in: this
 * service only has to know whether there is a session and what its profile calls
 * each slot, which is what these two answer.
 */
const createCook = () => ({
  state: {
    GetState: jest
      .fn()
      .mockResolvedValue({ smokeId: 'smoke-1', smoking: true }),
  },
  profile: {
    getCurrentSmokeProfile: jest.fn().mockResolvedValue({
      chamberName: 'Chamber',
      probe1Name: '',
      probe2Name: '',
      probe3Name: '',
    }),
  },
});

/** The update operators this collection understands, as Mongo names them. */
interface UpdateOperators<T> {
  $set?: Partial<T>;
  $setOnInsert?: Partial<T>;
  $unset?: Record<string, ''>;
}

/**
 * Stand-in for a Mongoose model, backed by a real collection of documents.
 *
 * A collection rather than a single slot on purpose: "the first write creates
 * the document and later writes update it" is only a claim worth testing if a
 * second document is something that could have happened. A write that does not
 * ask to upsert therefore stores nothing when the collection is empty, exactly
 * as Mongo behaves, and `all()` shows how many documents ended up there.
 *
 * The update is applied inside the one turn that runs it, the way the server
 * applies it: two overlapping writes each see the document as the other left
 * it. A fake that read, merged and wrote back across turns would let a
 * lost-update bug pass.
 */
const createSettingsCollection = <T>(seed: T | null = null) => {
  const documents: T[] = seed === null ? [] : [{ ...seed }];
  return {
    findOne: jest.fn(() => ({
      exec: () =>
        Promise.resolve(
          documents.length === 0 ? null : { ...(documents[0] as object) },
        ),
    })),
    findOneAndUpdate: jest.fn(
      (
        _filter: unknown,
        update: UpdateOperators<T>,
        options?: { upsert?: boolean },
      ) => ({
        exec: () => {
          const inserting = documents.length === 0;
          if (inserting && !options?.upsert) {
            return Promise.resolve(null);
          }
          const base = inserting
            ? { ...(update.$setOnInsert as object) }
            : { ...(documents[0] as object) };
          const next = { ...base, ...(update.$set as object) } as Record<
            string,
            unknown
          >;
          Object.keys(update.$unset ?? {}).forEach((field) => {
            delete next[field];
          });
          if (inserting) {
            documents.push(next as T);
          } else {
            documents[0] = next as T;
          }
          return Promise.resolve({ ...(documents[0] as object) });
        },
      }),
    ),
    /** Every document in the collection right now. */
    all: () => documents.map((document) => ({ ...(document as object) }) as T),
  };
};

/**
 * The gateway, seen only as the announcement it makes. What a connected client
 * is told is the observable part; the socket underneath it is the gateway's own
 * business and has its own tests.
 */
const createClients = () => {
  const announced: AppearancePreference[] = [];
  const announcedStamps: CookStamp[][] = [];
  return {
    broadcastAppearance: (preference: AppearancePreference) => {
      announced.push(preference);
    },
    broadcastCookLogStamps: (stamps: CookStamp[]) => {
      announcedStamps.push(stamps);
    },
    /** Every appearance announced to connected clients, in order. */
    announced,
    /** Every catalogue announced to connected clients, in order. */
    announcedStamps,
  };
};

/**
 * The service, over a given collection, with a cook to name the probe rows from
 * and connected clients listening.
 */
const createService = async (
  settings: unknown,
  clients: ReturnType<typeof createClients> = createClients(),
  cookNames: ReturnType<typeof createCook> = createCook(),
): Promise<AppSettingsService> => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AppSettingsService,
      {
        provide: getModelToken(ApplicationSettings.name),
        useValue: settings,
      },
      { provide: StateService, useValue: cookNames.state },
      { provide: SmokeProfileService, useValue: cookNames.profile },
      { provide: EventsGateway, useValue: clients },
    ],
  }).compile();

  return module.get<AppSettingsService>(AppSettingsService);
};

describe('AppSettingsService', () => {
  let service: AppSettingsService;
  let settings: ReturnType<
    typeof createSettingsCollection<ApplicationSettings>
  >;
  let clients: ReturnType<typeof createClients>;
  let cook: ReturnType<typeof createCook>;

  beforeEach(async () => {
    settings = createSettingsCollection<ApplicationSettings>();
    clients = createClients();
    cook = createCook();
    service = await createService(settings, clients, cook);
  });

  describe('reading the settings of a deployment that has never saved any', () => {
    it('answers with the documented defaults rather than an error', async () => {
      expect(await service.getSettings()).toEqual({
        chamber: { enabled: false, low: 225, high: 275 },
        probeTarget: DEFAULT_PROBE_TARGET_BLOCK,
        smokeComplete: SMOKE_COMPLETE_OFF,
        headsUp: HEADS_UP_OFF,
        targetPresets: DEFAULT_TARGET_PRESETS,
        appearance: { mode: 'system', resolvedMode: 'dark' },
        autoStop: AUTO_STOP_DEFAULT,
        cookLog: COOK_LOG_DEFAULT,
      });
    });
  });

  describe('reading a document Mongoose hands back', () => {
    /**
     * Mongoose returns documents, not plain objects: a nested block is a
     * subdocument carrying `$__`/`_doc` internals. Copying one wholesale would
     * publish those over the API *and* lose the fields themselves, so the read
     * has to name the fields it serves.
     */
    it('serves exactly the settings fields, never the persistence internals riding on them', async () => {
      const mongooseShaped = await createService(
        createSettingsCollection<ApplicationSettings>({
          chamber: Object.assign(
            Object.create({ enabled: true, low: 200, high: 300 }),
            { $__: 'mongoose-internal', _doc: {} },
          ),
          appearance: Object.assign(
            Object.create({ mode: 'dark', resolvedMode: 'dark' }),
            { $__: 'mongoose-internal', _doc: {} },
          ),
        } as unknown as ApplicationSettings),
      );

      expect(await mongooseShaped.getSettings()).toEqual({
        chamber: { enabled: true, low: 200, high: 300 },
        probeTarget: DEFAULT_PROBE_TARGET_BLOCK,
        smokeComplete: SMOKE_COMPLETE_OFF,
        headsUp: HEADS_UP_OFF,
        targetPresets: DEFAULT_TARGET_PRESETS,
        appearance: { mode: 'dark', resolvedMode: 'dark' },
        autoStop: AUTO_STOP_DEFAULT,
        cookLog: COOK_LOG_DEFAULT,
      });
    });
  });

  describe('reading the probe rows of the Probe Target Reached alert', () => {
    /** The stored document of a cook watching one probe. */
    const watchingProbe2 = {
      chamber: { enabled: false, low: 225, high: 275 },
      probeTarget: {
        enabled: true,
        probes: [{ slot: 'probe2', enabled: true, target: 195 }],
      },
    } as unknown as ApplicationSettings;

    /** A service reading one seeded document, with the cook it is named from. */
    const serviceReading = async (
      seed: ApplicationSettings,
      cookNames: ReturnType<typeof createCook> = createCook(),
    ) =>
      createService(
        createSettingsCollection<ApplicationSettings>(seed),
        createClients(),
        cookNames,
      );

    // The settings page renders a row per probe and the alert engine walks the
    // same list, so neither can be left guessing which slots exist: a document
    // saved before a slot was known — or with a slot dropped — still reads as
    // one entry per probe, in slot order.
    it('serves one entry per probe slot, whatever subset the stored document carries', async () => {
      const reading = await serviceReading(watchingProbe2);

      expect((await reading.getSettings()).probeTarget).toEqual({
        enabled: true,
        probes: [
          { slot: 'probe1', enabled: false, target: 203, ...untouched },
          // 195°F on a document that predates provenance: see the upgrade
          // tests below for why that reads as the user's own.
          { slot: 'probe2', enabled: true, target: 195, ...byHand },
          { slot: 'probe3', enabled: false, target: 203, ...untouched },
        ],
      });
    });

    /**
     * Per-probe targets shipped before this slice did, so every installation
     * already carries targets somebody typed with nothing recording that they
     * did. Seeding must not treat those as its own to overwrite — a probe set
     * to 145°F for a pork loin that came back as 195°F on the next cook would
     * be the upgrade quietly ruining dinner.
     */
    describe('reading targets stored before they had a provenance', () => {
      const legacyDocument = (target: number) =>
        ({
          probeTarget: {
            enabled: true,
            probes: [{ slot: 'probe1', enabled: true, target }],
          },
        }) as unknown as ApplicationSettings;

      it('treats a target that is not the shipped default as the user’s own', async () => {
        const reading = await serviceReading(legacyDocument(145));

        expect((await reading.getSettings()).probeTarget.probes[0]).toEqual({
          slot: 'probe1',
          enabled: true,
          target: 145,
          ...byHand,
        });
      });

      // Nothing distinguishes a row left on the shipped 203°F from one nobody
      // ever opened, so it is read as untouched and an upgraded installation
      // still gets the presets this slice exists to apply.
      it('treats a target still on the shipped default as untouched', async () => {
        const reading = await serviceReading(legacyDocument(203));

        expect((await reading.getSettings()).probeTarget.probes[0]).toEqual({
          slot: 'probe1',
          enabled: true,
          target: 203,
          ...untouched,
        });
      });

      it('seeds nothing over a hand-typed target it inherited', async () => {
        const reading = await serviceReading(legacyDocument(145));

        await reading.seedProbeTargets('Pork shoulder');

        expect((await reading.getSettings()).probeTarget.probes[0].target).toBe(
          145,
        );
      });
    });

    it('names each probe row as the active cook names it', async () => {
      const cookNames = createCook();
      cookNames.profile.getCurrentSmokeProfile.mockResolvedValue({
        probe1Name: 'Brisket Flat',
        probe2Name: 'Pork Butt',
        probe3Name: '',
      });
      const reading = await serviceReading(watchingProbe2, cookNames);

      expect((await reading.getResolvedSettings()).probeTarget.probes).toEqual([
        {
          slot: 'probe1',
          enabled: false,
          target: 203,
          ...untouched,
          name: 'Brisket Flat',
        },
        {
          slot: 'probe2',
          enabled: true,
          target: 195,
          ...byHand,
          name: 'Pork Butt',
        },
        {
          slot: 'probe3',
          enabled: false,
          target: 203,
          ...untouched,
          name: 'Probe 3',
        },
      ]);
    });

    // The settings page is reachable with nothing cooking, and the profile
    // service answers a no-session read with placeholder names of its own —
    // which are not the labels this feature shows.
    it('shows generic slot labels when no session is active', async () => {
      const cookNames = createCook();
      cookNames.state.GetState.mockResolvedValue({
        smokeId: '',
        smoking: false,
      });
      cookNames.profile.getCurrentSmokeProfile.mockResolvedValue({
        probe1Name: 'Brisket Flat',
        probe2Name: 'Pork Butt',
        probe3Name: 'Ribs',
      });
      const reading = await serviceReading(watchingProbe2, cookNames);

      const resolved = await reading.getResolvedSettings();

      expect(resolved.probeTarget.probes.map((probe) => probe.name)).toEqual([
        'Probe 1',
        'Probe 2',
        'Probe 3',
      ]);
    });

    // A cook started from pre-smoke has a smoke before it has a smoke profile,
    // and the profile service fills that window with placeholders of its own.
    it('shows generic slot labels while the cook has no smoke profile saved yet', async () => {
      const cookNames = createCook();
      cookNames.profile.getCurrentSmokeProfile.mockResolvedValue({
        chamberName: 'Chamber',
        probe1Name: 'Probe1',
        probe2Name: 'Probe2',
        probe3Name: 'Probe3',
      });
      const reading = await serviceReading(watchingProbe2, cookNames);

      const resolved = await reading.getResolvedSettings();

      expect(resolved.probeTarget.probes.map((probe) => probe.name)).toEqual([
        'Probe 1',
        'Probe 2',
        'Probe 3',
      ]);
    });

    it('serves the settings themselves unchanged alongside the names', async () => {
      const reading = await serviceReading(watchingProbe2);

      const resolved = await reading.getResolvedSettings();

      expect(resolved.chamber).toEqual({
        enabled: false,
        low: 225,
        high: 275,
      });
      expect(resolved.probeTarget.enabled).toBe(true);
    });

    // Watch state and targets are the user's, and outlive both the cook that
    // was running when they were set and the browser that set them.
    it('reads back the watch list and targets a save stored', async () => {
      await service.saveSettings({
        probeTarget: {
          enabled: true,
          probes: [
            { slot: 'probe1', enabled: true, target: 203, ...byHand },
            { slot: 'probe2', enabled: false, target: 195, ...byHand },
            { slot: 'probe3', enabled: false, target: 203, ...byHand },
          ],
        },
      });

      expect((await service.getSettings()).probeTarget).toEqual({
        enabled: true,
        probes: [
          { slot: 'probe1', enabled: true, target: 203, ...byHand },
          { slot: 'probe2', enabled: false, target: 195, ...byHand },
          { slot: 'probe3', enabled: false, target: 203, ...byHand },
        ],
      });
    });

    /**
     * The stored row says where its target came from; nothing downstream is
     * left to work it out again.
     *
     * Provenance is inferred only for rows written before it existed, and that
     * inference cannot tell a deliberate 203°F from an untouched one. A save
     * that stored a row without provenance would leave every later read
     * guessing — so a client too old to send one still has its rows stored with
     * one worked out here, once.
     */
    it('stores an explicit provenance for a row saved without one', async () => {
      await service.saveSettings({
        probeTarget: {
          enabled: true,
          probes: [
            { slot: 'probe1', enabled: true, target: 145 },
            { slot: 'probe2', enabled: true, target: 203 },
          ],
        } as ApplicationSettings['probeTarget'],
      });

      expect(settings.all()[0].probeTarget.probes).toEqual([
        { slot: 'probe1', enabled: true, target: 145, ...byHand },
        { slot: 'probe2', enabled: true, target: 203, ...untouched },
        { slot: 'probe3', enabled: false, target: 203, ...untouched },
      ]);
    });

    // The document's three writers are independent: saving probe targets must
    // not reset the appearance a browser chose, nor the chamber alert.
    it('leaves the other blocks alone when only the probe rows are saved', async () => {
      await service.saveSettings({
        chamber: { enabled: true, low: 200, high: 250 },
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });

      await service.saveSettings({
        probeTarget: {
          enabled: true,
          probes: [{ slot: 'probe1', enabled: true, target: 203, ...byHand }],
        },
      });

      expect(await service.getSettings()).toMatchObject({
        chamber: { enabled: true, low: 200, high: 250 },
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });
    });
  });

  /**
   * A cook starts by typing what is going on the smoker, not by copying a
   * temperature off a chart. The category that meat belongs to carries a
   * default target, and every probe the user has not deliberately set is given
   * it when the session begins.
   */
  describe('seeding probe targets for the meat being cooked', () => {
    /** A cook watching all three probes, none of whose targets they set. */
    const watchingEveryProbe = {
      enabled: true,
      probes: [
        {
          slot: 'probe1',
          enabled: true,
          target: 203,
          targetSource: 'default',
          leadMinutes: null,
        },
        {
          slot: 'probe2',
          enabled: true,
          target: 203,
          targetSource: 'default',
          leadMinutes: null,
        },
        {
          slot: 'probe3',
          enabled: true,
          target: 203,
          targetSource: 'default',
          leadMinutes: null,
        },
      ],
    } as ApplicationSettings['probeTarget'];

    it('gives a watched probe the default target of the matched category', async () => {
      await service.saveSettings({ probeTarget: watchingEveryProbe });

      await service.seedProbeTargets('Whole chicken');

      expect(
        (await service.getSettings()).probeTarget.probes.map(
          (probe) => probe.target,
        ),
      ).toEqual([165, 165, 165]);
    });

    // The person at the smoker outranks the preset: a temperature they typed is
    // the one they will be told about, whatever category the meat falls into.
    it('leaves a target the user typed in alone', async () => {
      await service.saveSettings({
        probeTarget: {
          enabled: true,
          probes: [
            { slot: 'probe1', enabled: true, target: 180, ...byHand },
            { slot: 'probe2', enabled: true, target: 203, ...untouched },
            { slot: 'probe3', enabled: true, target: 203, ...untouched },
          ],
        },
      });

      await service.seedProbeTargets('Whole chicken');

      expect(
        (await service.getSettings()).probeTarget.probes.map(
          (probe) => probe.target,
        ),
      ).toEqual([180, 165, 165]);
    });

    // The temperatures shipped are the ones the PRD's operator should not have
    // to remember: a pork butt at 195°F, poultry at the 165°F it is safe at,
    // beef at the 203°F a brisket is done at.
    it.each([
      ['Pork shoulder', 195],
      ['Whole chicken', 165],
      ['Packer brisket', 203],
    ])(
      'takes a cook of %s to %d°F out of the box',
      async (meatType, target) => {
        await service.saveSettings({ probeTarget: watchingEveryProbe });

        await service.seedProbeTargets(meatType);

        expect((await service.getSettings()).probeTarget.probes[0].target).toBe(
          target,
        );
      },
    );

    // A probe nobody is watching is a row that was switched off deliberately.
    // Writing a temperature onto it would be an alert waiting to happen the
    // moment it is switched back on.
    it('leaves a probe that is not being watched alone', async () => {
      await service.saveSettings({
        probeTarget: {
          enabled: true,
          probes: [
            { slot: 'probe1', enabled: true, target: 203, ...untouched },
            { slot: 'probe2', enabled: false, target: 203, ...untouched },
            { slot: 'probe3', enabled: false, target: 203, ...untouched },
          ],
        },
      });

      await service.seedProbeTargets('Whole chicken');

      expect((await service.getSettings()).probeTarget.probes).toEqual([
        {
          slot: 'probe1',
          enabled: true,
          target: 165,
          targetSource: 'preset',
          leadMinutes: null,
        },
        { slot: 'probe2', enabled: false, target: 203, ...untouched },
        { slot: 'probe3', enabled: false, target: 203, ...untouched },
      ]);
    });

    it('changes nothing when the meat type is not one it recognises', async () => {
      await service.saveSettings({ probeTarget: watchingEveryProbe });

      await service.seedProbeTargets('Salmon fillet');

      expect((await service.getSettings()).probeTarget.probes).toEqual(
        watchingEveryProbe.probes,
      );
    });

    // Nothing is cooking that anyone described, so there is no category to seed
    // from — the same silence as an unrecognised meat.
    it('changes nothing when no meat type was recorded at all', async () => {
      await service.saveSettings({ probeTarget: watchingEveryProbe });

      await service.seedProbeTargets(undefined);

      expect((await service.getSettings()).probeTarget.probes).toEqual(
        watchingEveryProbe.probes,
      );
    });

    it('applies the presets the user edited rather than the shipped ones', async () => {
      await service.saveSettings({
        probeTarget: watchingEveryProbe,
        targetPresets: { beef: 210, pork: 200, poultry: 165 },
      });

      await service.seedProbeTargets('Packer brisket');

      expect(
        (await service.getSettings()).probeTarget.probes.map(
          (probe) => probe.target,
        ),
      ).toEqual([210, 210, 210]);
    });
  });

  describe('writing a preference into a deployment that has never saved any', () => {
    /**
     * The first browser to choose an appearance is writing into an empty
     * database. There is no create step for it to have done first, so the write
     * itself has to bring the document into being.
     */
    it('creates the document the first write has nothing to update', async () => {
      await service.saveSettings({
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });

      expect(await service.getSettings()).toMatchObject({
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });
    });

    it('creates it complete when the write carries both blocks at once', async () => {
      await service.saveSettings({
        chamber: { enabled: true, low: 200, high: 250 },
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });

      expect(await service.getSettings()).toEqual({
        chamber: { enabled: true, low: 200, high: 250 },
        probeTarget: DEFAULT_PROBE_TARGET_BLOCK,
        smokeComplete: SMOKE_COMPLETE_OFF,
        headsUp: HEADS_UP_OFF,
        targetPresets: DEFAULT_TARGET_PRESETS,
        appearance: { mode: 'dark', resolvedMode: 'dark' },
        autoStop: AUTO_STOP_DEFAULT,
        cookLog: COOK_LOG_DEFAULT,
      });
      expect(settings.all()).toHaveLength(1);
    });

    /**
     * A body carrying no block at all asks for nothing in particular, which on
     * an empty database is still a document — the defaults — rather than a
     * malformed write.
     */
    it('creates the defaults when the write carries no block at all', async () => {
      await service.saveSettings({});

      expect(await service.getSettings()).toEqual({
        chamber: { enabled: false, low: 225, high: 275 },
        probeTarget: DEFAULT_PROBE_TARGET_BLOCK,
        smokeComplete: SMOKE_COMPLETE_OFF,
        headsUp: HEADS_UP_OFF,
        targetPresets: DEFAULT_TARGET_PRESETS,
        appearance: { mode: 'system', resolvedMode: 'dark' },
        autoStop: AUTO_STOP_DEFAULT,
        cookLog: COOK_LOG_DEFAULT,
      });
    });

    it('updates that document on the next write rather than adding another', async () => {
      await service.saveSettings({
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });
      await service.saveSettings({
        appearance: { mode: 'light', resolvedMode: 'light' },
      });

      expect(await service.getSettings()).toMatchObject({
        appearance: { mode: 'light', resolvedMode: 'light' },
      });
      expect(settings.all()).toHaveLength(1);
    });
  });

  /**
   * How long a silent stream means "the cook is over" is the pitmaster's to
   * tune — a low-and-slow overnighter and a burger session do not sit idle for
   * the same length of time before they are abandoned.
   */
  describe('the auto-stop idle threshold', () => {
    // A deployment that has never opened the settings page — or one whose
    // document was written before this field existed — must still answer with a
    // number, because the auto-stop decision compares against it. An absent
    // threshold would read as "never idle" and leave the zombie cooks in place.
    it('reads as six hours until somebody sets one', async () => {
      expect((await service.getSettings()).autoStop).toEqual({ idleHours: 6 });
    });

    it('reads back the threshold that was saved', async () => {
      await service.saveSettings({ autoStop: { idleHours: 12 } });

      expect((await service.getSettings()).autoStop).toEqual({ idleHours: 12 });
    });

    // The threshold is saved by its own card on the settings page, beside the
    // cards that save the alerts and the presets. A save that disturbed
    // another's block would undo whatever the operator had just changed there.
    it('leaves the other blocks as they were', async () => {
      await service.saveSettings({
        chamber: { enabled: true, low: 200, high: 250 },
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });

      await service.saveSettings({ autoStop: { idleHours: 12 } });

      expect(await service.getSettings()).toEqual({
        chamber: { enabled: true, low: 200, high: 250 },
        probeTarget: DEFAULT_PROBE_TARGET_BLOCK,
        smokeComplete: SMOKE_COMPLETE_OFF,
        headsUp: HEADS_UP_OFF,
        targetPresets: DEFAULT_TARGET_PRESETS,
        appearance: { mode: 'dark', resolvedMode: 'dark' },
        autoStop: { idleHours: 12 },
        cookLog: COOK_LOG_DEFAULT,
      });
    });

    // Saving anything else must not quietly reset a tuned threshold back to the
    // shipped six hours.
    it('survives a save from another card', async () => {
      await service.saveSettings({ autoStop: { idleHours: 12 } });

      await service.saveSettings({
        chamber: { enabled: true, low: 200, high: 250 },
      });

      expect((await service.getSettings()).autoStop).toEqual({ idleHours: 12 });
    });
  });

  /**
   * The document now serves two unrelated writers: the settings page saving the
   * chamber alert, and any browser that repaints itself saving the appearance.
   * Neither may take the other's block with it.
   */
  describe('two writers sharing one document', () => {
    it('keeps the appearance a browser chose when the settings page saves an alert', async () => {
      await service.saveSettings({
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });

      await service.saveSettings({
        chamber: { enabled: true, low: 200, high: 250 },
      });

      expect(await service.getSettings()).toEqual({
        chamber: { enabled: true, low: 200, high: 250 },
        probeTarget: DEFAULT_PROBE_TARGET_BLOCK,
        smokeComplete: SMOKE_COMPLETE_OFF,
        headsUp: HEADS_UP_OFF,
        targetPresets: DEFAULT_TARGET_PRESETS,
        appearance: { mode: 'dark', resolvedMode: 'dark' },
        autoStop: AUTO_STOP_DEFAULT,
        cookLog: COOK_LOG_DEFAULT,
      });
    });

    it('keeps the alert the settings page saved when a browser chooses an appearance', async () => {
      await service.saveSettings({
        chamber: { enabled: true, low: 200, high: 250 },
      });

      await service.saveSettings({
        appearance: { mode: 'light', resolvedMode: 'light' },
      });

      expect(await service.getSettings()).toEqual({
        chamber: { enabled: true, low: 200, high: 250 },
        probeTarget: DEFAULT_PROBE_TARGET_BLOCK,
        smokeComplete: SMOKE_COMPLETE_OFF,
        headsUp: HEADS_UP_OFF,
        targetPresets: DEFAULT_TARGET_PRESETS,
        appearance: { mode: 'light', resolvedMode: 'light' },
        autoStop: AUTO_STOP_DEFAULT,
        cookLog: COOK_LOG_DEFAULT,
      });
    });

    /**
     * The two writers are two people at two screens, so their saves overlap:
     * an operator turns the alert on in the settings page while another browser
     * repaints itself. Neither save is told about the other, so a write that
     * read the document first and wrote the whole thing back would quietly undo
     * whichever change landed while it was reading.
     */
    it('keeps both blocks when the two writers save at the same time', async () => {
      const saves = Promise.all([
        service.saveSettings({
          chamber: { enabled: true, low: 200, high: 250 },
        }),
        service.saveSettings({
          appearance: { mode: 'dark', resolvedMode: 'dark' },
        }),
      ]);

      await saves;

      expect(await service.getSettings()).toEqual({
        chamber: { enabled: true, low: 200, high: 250 },
        probeTarget: DEFAULT_PROBE_TARGET_BLOCK,
        smokeComplete: SMOKE_COMPLETE_OFF,
        headsUp: HEADS_UP_OFF,
        targetPresets: DEFAULT_TARGET_PRESETS,
        appearance: { mode: 'dark', resolvedMode: 'dark' },
        autoStop: AUTO_STOP_DEFAULT,
        cookLog: COOK_LOG_DEFAULT,
      });
      expect(settings.all()).toHaveLength(1);
    });
  });

  /**
   * The freeform rule documents of the previous schema are not migrated, so a
   * deployment upgrading into this one has a document whose fields mean nothing
   * here. A save must not leave them behind for a later reader to trip over.
   */
  describe('a document of the deleted rule shape', () => {
    it('loses that shape the first time anything is saved', async () => {
      const legacy = createSettingsCollection<ApplicationSettings>({
        settings: [{ type: true, message: 'probe1 is done' }],
      } as unknown as ApplicationSettings);
      const service = await createService(legacy);
      await service.saveSettings({
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });

      expect(legacy.all()[0]).not.toHaveProperty('settings');
      expect(await service.getSettings()).toEqual({
        chamber: { enabled: false, low: 225, high: 275 },
        probeTarget: DEFAULT_PROBE_TARGET_BLOCK,
        smokeComplete: SMOKE_COMPLETE_OFF,
        headsUp: HEADS_UP_OFF,
        targetPresets: DEFAULT_TARGET_PRESETS,
        appearance: { mode: 'dark', resolvedMode: 'dark' },
        autoStop: AUTO_STOP_DEFAULT,
        cookLog: COOK_LOG_DEFAULT,
      });
    });
  });

  /**
   * The preference is installation-wide, so a browser choosing dark is choosing
   * it for the touchscreen in the garage as well. Waiting for that screen to be
   * reloaded would leave the installation disagreeing with itself for as long as
   * nobody walks over to it, so the write itself tells whoever is connected.
   */
  describe('a written appearance preference', () => {
    it('is announced to the clients already open', async () => {
      await service.saveSettings({
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });

      expect(clients.announced).toEqual([
        { mode: 'dark', resolvedMode: 'dark' },
      ]);
    });

    /**
     * The document serves two unrelated writers. An operator saving the chamber
     * alert has said nothing about how the installation looks, and announcing an
     * appearance there would have every connected client repaint for a setting
     * that is nothing to do with them.
     */
    it('is not announced when the write was about something else', async () => {
      await service.saveSettings({
        chamber: { enabled: true, low: 200, high: 250 },
      });

      expect(clients.announced).toEqual([]);
    });

    /**
     * A preference the backend refused was never stored, so announcing it would
     * hand every connected client a scheme the next load contradicts.
     */
    it('is not announced when it was refused', async () => {
      await expect(
        service.saveSettings({
          appearance: { mode: 'light', resolvedMode: 'dark' },
        }),
      ).rejects.toThrow();

      expect(clients.announced).toEqual([]);
    });
  });

  describe('a preference that contradicts itself', () => {
    /**
     * Every client reads this document to decide what to paint. A preference
     * saying "always light" and "currently dark" at once would have each of them
     * guessing which half was meant, so it is refused at the door rather than
     * stored and interpreted differently by each reader.
     */
    it('is refused', async () => {
      await expect(
        service.saveSettings({
          appearance: { mode: 'light', resolvedMode: 'dark' },
        }),
      ).rejects.toThrow(/appearance/i);
    });

    it('leaves the stored preference untouched', async () => {
      await service.saveSettings({
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });

      await expect(
        service.saveSettings({
          appearance: { mode: 'light', resolvedMode: 'dark' },
        }),
      ).rejects.toThrow();

      expect(await service.getSettings()).toMatchObject({
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });
    });
  });
  describe('the cook log stamp catalogue', () => {
    it('reads the six defaults on an installation whose document has no block', async () => {
      expect((await service.getSettings()).cookLog.stamps).toEqual(
        defaultStamps(),
      );
    });

    it('stores an edited catalogue and announces it to every open screen', async () => {
      const edited = defaultStamps().map((stamp) =>
        stamp.key === 'wood' ? { ...stamp, label: 'Split', tone: 'p2' } : stamp,
      ) as CookStamp[];

      const saved = await service.saveSettings({ cookLog: { stamps: edited } });

      expect(saved.cookLog.stamps[0]).toEqual({
        key: 'wood',
        label: 'Split',
        tone: 'p2',
        enabled: true,
        custom: false,
      });
      expect((await service.getSettings()).cookLog.stamps).toEqual(edited);
      expect(clients.announcedStamps).toEqual([edited]);
    });

    it('refuses a catalogue no client should have sent, and stores nothing', async () => {
      const dropped = defaultStamps().filter((stamp) => stamp.key !== 'vent');

      await expect(
        service.saveSettings({ cookLog: { stamps: dropped } }),
      ).rejects.toThrow(/vent/);
      expect((await service.getSettings()).cookLog.stamps).toEqual(
        defaultStamps(),
      );
      expect(clients.announcedStamps).toEqual([]);
    });

    it('says nothing about the catalogue when a write did not touch it', async () => {
      await service.saveSettings({
        chamber: { enabled: true, low: 1, high: 2 },
      });

      expect(clients.announcedStamps).toEqual([]);
    });
  });
});
