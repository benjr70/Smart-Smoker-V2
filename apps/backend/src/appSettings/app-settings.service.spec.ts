import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationSettings } from './app-settings.schema';
import { AppSettingsService } from './app-settings.service';

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

describe('AppSettingsService', () => {
  let service: AppSettingsService;
  let settings: ReturnType<
    typeof createSettingsCollection<ApplicationSettings>
  >;

  beforeEach(async () => {
    settings = createSettingsCollection<ApplicationSettings>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppSettingsService,
        {
          provide: getModelToken(ApplicationSettings.name),
          useValue: settings,
        },
      ],
    }).compile();

    service = module.get<AppSettingsService>(AppSettingsService);
  });

  describe('reading the settings of a deployment that has never saved any', () => {
    it('answers with the documented defaults rather than an error', async () => {
      expect(await service.getSettings()).toEqual({
        chamber: { enabled: false, low: 225, high: 275 },
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
      const module = await Test.createTestingModule({
        providers: [
          AppSettingsService,
          {
            provide: getModelToken(ApplicationSettings.name),
            useValue: createSettingsCollection<ApplicationSettings>({
              chamber: Object.assign(
                Object.create({ enabled: true, low: 200, high: 300 }),
                { $__: 'mongoose-internal', _doc: {} },
              ),
              appearance: Object.assign(
                Object.create({ mode: 'dark', resolvedMode: 'dark' }),
                { $__: 'mongoose-internal', _doc: {} },
              ),
            } as unknown as ApplicationSettings),
          },
        ],
      }).compile();

      expect(
        await module.get<AppSettingsService>(AppSettingsService).getSettings(),
      ).toEqual({
        chamber: { enabled: true, low: 200, high: 300 },
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
      const module = await Test.createTestingModule({
        providers: [
          AppSettingsService,
          {
            provide: getModelToken(ApplicationSettings.name),
            useValue: legacy,
          },
        ],
      }).compile();

      const service = module.get<AppSettingsService>(AppSettingsService);
      await service.saveSettings({
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });

      expect(legacy.all()[0]).not.toHaveProperty('settings');
      expect(await service.getSettings()).toEqual({
        chamber: { enabled: false, low: 225, high: 275 },
        appearance: { mode: 'dark', resolvedMode: 'dark' },
      });
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
