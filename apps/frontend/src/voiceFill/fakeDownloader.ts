/**
 * A scripted stand-in for the downloader the Model library fetches models
 * through: nothing is fetched, and a model "arrives" a chunk at a time on a
 * timer. What has arrived is kept in the storage it is given, as a real
 * download is kept in the browser's cache, so a download picks up after a
 * reload from where it stopped.
 */
import type { ModelDownloader } from './modelLibrary';
import type { VoiceFillModel } from './modelRegistry';

export interface FakeDownloaderScript {
  /** Where what has arrived is kept. Left out, it is kept only in memory. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** How long each chunk takes to arrive, in ms. */
  chunkMs?: number;
  /** How many chunks a whole model arrives in. */
  chunks?: number;
  /** The ids of the models that download but cannot be loaded on this phone. */
  failingTestLoad?: readonly string[];
}

const STORAGE_KEY = 'voiceFill.fakeDownloads';

const createMemoryStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  const kept = new Map<string, string>();
  return {
    getItem: key => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value);
    },
  };
};

export const createFakeDownloader = ({
  storage = createMemoryStorage(),
  chunkMs = 60,
  chunks = 10,
  failingTestLoad = [],
}: FakeDownloaderScript = {}): ModelDownloader => {
  const arrived = (): Record<string, number> => {
    try {
      return JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') as Record<string, number>;
    } catch {
      return {};
    }
  };
  const keep = (id: string, bytes: number | undefined): void => {
    const next = arrived();
    if (bytes === undefined) {
      delete next[id];
    } else {
      next[id] = bytes;
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  };
  const isWhole = (model: VoiceFillModel): boolean => (arrived()[model.id] ?? 0) >= model.sizeBytes;

  return {
    download: (model, { onProgress, signal }) =>
      new Promise<void>((resolve, reject) => {
        if (isWhole(model)) {
          resolve();
          return;
        }
        const timer = setInterval(() => {
          const bytes = Math.min(
            model.sizeBytes,
            (arrived()[model.id] ?? 0) + Math.ceil(model.sizeBytes / chunks)
          );
          keep(model.id, bytes);
          onProgress(bytes);
          if (bytes >= model.sizeBytes) {
            clearInterval(timer);
            resolve();
          }
        }, chunkMs);
        signal.addEventListener('abort', () => {
          clearInterval(timer);
          reject(new Error('The download was stopped.'));
        });
      }),
    testLoad: model => Promise.resolve(!failingTestLoad.includes(model.id)),
    has: model => Promise.resolve(isWhole(model)),
    remove: model => {
      keep(model.id, undefined);
      return Promise.resolve();
    },
  };
};
