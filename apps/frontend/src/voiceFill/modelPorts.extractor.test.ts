import { createFakeDownloader } from './fakeDownloader';
import type { ModelDownloader } from './modelLibrary';
import { createLazyExtractor, createModelDownloader, createPickedExtractor } from './modelPorts';
import type { VoiceFillModel } from './modelRegistry';
import type { ExtractorPort } from './ports';

const context = { now: new Date(2026, 9, 3, 15, 5) };

/** An extractor that answers with `raw` and counts what it is asked. */
const extractorGiving = (raw: unknown) => {
  const asked = { loads: 0, unloads: 0, extractions: 0 };
  const extractor: ExtractorPort = {
    load: () => {
      asked.loads += 1;
      return Promise.resolve();
    },
    extract: () => {
      asked.extractions += 1;
      return Promise.resolve(raw);
    },
    unload: () => {
      asked.unloads += 1;
      return Promise.resolve();
    },
  };
  return { extractor, asked };
};

describe('an extractor whose adapter is imported lazily', () => {
  it('imports nothing until it is asked to load, and then only once', async () => {
    const { extractor, asked } = extractorGiving({ weight: 16 });
    const adapter = jest.fn(() => Promise.resolve(extractor));
    const lazy = createLazyExtractor(adapter);
    expect(adapter).not.toHaveBeenCalled();

    await lazy.load();
    await expect(lazy.extract('preSmoke', 'Sixteen pounds.', context)).resolves.toEqual({
      weight: 16,
    });
    await lazy.unload();

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(asked).toEqual({ loads: 1, unloads: 1, extractions: 1 });
  });

  it('does not import the adapter to let go of a model that was never loaded', async () => {
    const adapter = jest.fn(() => Promise.resolve(extractorGiving({}).extractor));

    await createLazyExtractor(adapter).unload();

    expect(adapter).not.toHaveBeenCalled();
  });

  it('tries an import that failed again', async () => {
    const { extractor } = extractorGiving({});
    const adapter = jest
      .fn<Promise<ExtractorPort>, []>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(extractor);
    const lazy = createLazyExtractor(adapter);

    await expect(lazy.load()).rejects.toThrow('offline');
    // Nothing was loaded, so there is nothing to let go of.
    await expect(lazy.unload()).resolves.toBeUndefined();
    await expect(lazy.load()).resolves.toBeUndefined();
  });
});

describe('the extractor of whichever model is picked', () => {
  it('reads a Ramble with the picked model', async () => {
    const gemma = extractorGiving({ meatType: 'brisket' });
    const other = extractorGiving({ meatType: 'ribs' });
    const picked = createPickedExtractor(() => 'gemma', {
      gemma: gemma.extractor,
      other: other.extractor,
    });

    await picked.load();

    await expect(picked.extract('preSmoke', 'Brisket.', context)).resolves.toEqual({
      meatType: 'brisket',
    });
    expect(other.asked).toEqual({ loads: 0, unloads: 0, extractions: 0 });
  });

  it('lets the model picked before go when another is picked, and reads with the new one', async () => {
    const gemma = extractorGiving({ meatType: 'brisket' });
    const other = extractorGiving({ meatType: 'ribs' });
    let id = 'gemma';
    const picked = createPickedExtractor(() => id, {
      gemma: gemma.extractor,
      other: other.extractor,
    });
    await picked.load();

    id = 'other';
    await picked.load();

    expect(gemma.asked.unloads).toBe(1);
    await expect(picked.extract('preSmoke', 'Ribs.', context)).resolves.toEqual({
      meatType: 'ribs',
    });

    await picked.unload();
    expect(other.asked.unloads).toBe(1);
  });

  it('cannot load where no model that can be run is picked', async () => {
    const { extractor } = extractorGiving({});

    await expect(createPickedExtractor(() => null, { gemma: extractor }).load()).rejects.toThrow(
      'No extraction model'
    );
    await expect(
      createPickedExtractor(() => 'toString', { gemma: extractor }).load()
    ).rejects.toThrow('No extraction model');
  });

  it('reads nothing, and has nothing to let go of, before it is loaded', async () => {
    const { extractor, asked } = extractorGiving({});
    const picked = createPickedExtractor(() => 'gemma', { gemma: extractor });

    await expect(picked.extract('preSmoke', 'Brisket.', context)).rejects.toThrow('not loaded');
    await expect(picked.unload()).resolves.toBeUndefined();
    expect(asked.unloads).toBe(0);
  });
});

describe('one downloader over several', () => {
  const GEMMA: VoiceFillModel = { id: 'gemma', role: 'extractor', name: 'Gemma', sizeBytes: 10 };
  const OTHER: VoiceFillModel = { id: 'other', role: 'extractor', name: 'Other', sizeBytes: 10 };

  it('asks each model’s own downloader, and the fallback where it has none', async () => {
    const own: ModelDownloader = {
      download: jest.fn(() => Promise.resolve()),
      testLoad: jest.fn(() => Promise.resolve(false)),
      has: jest.fn(() => Promise.resolve(true)),
      remove: jest.fn(() => Promise.resolve()),
    };
    const downloader = createModelDownloader({ gemma: own }, createFakeDownloader());
    const options = { onProgress: jest.fn(), signal: new AbortController().signal };

    await downloader.download(GEMMA, options);
    expect(own.download).toHaveBeenCalledWith(GEMMA, options);
    await expect(downloader.testLoad(GEMMA)).resolves.toBe(false);
    await expect(downloader.has(GEMMA)).resolves.toBe(true);
    await downloader.remove(GEMMA);
    expect(own.remove).toHaveBeenCalledWith(GEMMA);

    // The scripted downloader holds nothing of a model nobody downloaded.
    await expect(downloader.has(OTHER)).resolves.toBe(false);
    await expect(downloader.testLoad(OTHER)).resolves.toBe(true);
    await expect(downloader.remove(OTHER)).resolves.toBeUndefined();
  });
});
