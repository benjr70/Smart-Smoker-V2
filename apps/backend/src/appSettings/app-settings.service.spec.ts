import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationSettings } from './app-settings.schema';
import { AppSettingsService } from './app-settings.service';

/**
 * Stand-in for a Mongoose model, backed by a real collection of documents.
 *
 * A collection rather than a single slot on purpose: "the first write creates
 * the document and later writes update it" is only a claim worth testing if a
 * second document is something that could have happened. A write that does not
 * ask to upsert therefore stores nothing when the collection is empty, exactly
 * as Mongo behaves, and `all()` shows how many documents ended up there.
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
    findOneAndReplace: jest.fn(
      (_filter: unknown, replacement: T, options?: { upsert?: boolean }) => ({
        exec: () => {
          if (documents.length === 0) {
            if (!options?.upsert) {
              return Promise.resolve(null);
            }
            documents.push({ ...(replacement as object) } as T);
          } else {
            documents[0] = { ...(replacement as object) } as T;
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
