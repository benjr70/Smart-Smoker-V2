import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { StateService } from '../State/state.service';
import { SmokeProfileService } from '../smokeProfile/smokeProfile.service';
import { EventsGateway } from '../websocket/events.gateway';
import { DEFAULT_APPLICATION_SETTINGS } from './app-settings.defaults';
import { ApplicationSettings } from './app-settings.schema';
import { AppSettingsService } from './app-settings.service';
import { AppearancePreference } from './appearance';

/** The probe rows a deployment that has configured nothing reads back as. */
const DEFAULT_PROBE_TARGET_BLOCK = DEFAULT_APPLICATION_SETTINGS.probeTarget;

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
  return {
    broadcastAppearance: (preference: AppearancePreference) => {
      announced.push(preference);
    },
    /** Every appearance announced to connected clients, in order. */
    announced,
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
        appearance: { mode: 'system', resolvedMode: 'light' },
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
        appearance: { mode: 'dark', resolvedMode: 'dark' },
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
          { slot: 'probe1', enabled: false, target: 203 },
          { slot: 'probe2', enabled: true, target: 195 },
          { slot: 'probe3', enabled: false, target: 203 },
        ],
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
        { slot: 'probe1', enabled: false, target: 203, name: 'Brisket Flat' },
        { slot: 'probe2', enabled: true, target: 195, name: 'Pork Butt' },
        { slot: 'probe3', enabled: false, target: 203, name: 'Probe 3' },
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
            { slot: 'probe1', enabled: true, target: 203 },
            { slot: 'probe2', enabled: false, target: 195 },
            { slot: 'probe3', enabled: false, target: 203 },
          ],
        },
      });

      expect((await service.getSettings()).probeTarget).toEqual({
        enabled: true,
        probes: [
          { slot: 'probe1', enabled: true, target: 203 },
          { slot: 'probe2', enabled: false, target: 195 },
          { slot: 'probe3', enabled: false, target: 203 },
        ],
      });
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
          probes: [{ slot: 'probe1', enabled: true, target: 203 }],
        },
      });

      expect(await service.getSettings()).toMatchObject({
        chamber: { enabled: true, low: 200, high: 250 },
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });
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
        appearance: { mode: 'dark', resolvedMode: 'dark' },
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
        appearance: { mode: 'system', resolvedMode: 'light' },
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
        appearance: { mode: 'dark', resolvedMode: 'dark' },
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
        appearance: { mode: 'light', resolvedMode: 'light' },
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
        appearance: { mode: 'dark', resolvedMode: 'dark' },
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
        appearance: { mode: 'dark', resolvedMode: 'dark' },
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
});
