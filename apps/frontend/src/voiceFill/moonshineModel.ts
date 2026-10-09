/**
 * Moonshine Small Streaming, as much of it as the application carries from the
 * start: where its files are kept on the phone, whether they are still there,
 * and the downloader and the speech port that reach for the rest only when
 * asked.
 *
 * The rest — the adapter and the WebAssembly binding it drives — is in a chunk
 * of its own. A download or a test-load fetches that chunk, and so does the
 * first Ramble; opening the app, or asking whether the model is on the phone,
 * does not.
 */
import type { ModelFile, ModelFileStore } from './modelFiles';
import { createCacheFileStore } from './modelFiles';
import type { ModelDownloader } from './modelLibrary';
import { createLazySpeech } from './modelPorts';
import type { SpeechPort } from './ports';

/** The browser cache Moonshine's files are kept in. */
export const MOONSHINE_CACHE = 'voiceFill.moonshine';

/**
 * What the list of the model's files is kept under, beside the files: written
 * once they have all arrived, so that whether the model is on the phone can be
 * answered without the binding that knows where its publisher lists them.
 */
export const MOONSHINE_FILE_LIST = '/voice-fill/moonshine/files.json';

type MoonshineAdapter = typeof import('./moonshineAdapter');

const importAdapter = (): Promise<MoonshineAdapter> =>
  import(/* webpackChunkName: "voice-fill-moonshine" */ './moonshineAdapter');

// The list holds names, addresses and sizes: plain ASCII, a byte to a character.
const toBytes = (text: string): Uint8Array =>
  Uint8Array.from(text, character => character.charCodeAt(0));
const fromBytes = (bytes: Uint8Array): string =>
  Array.from(bytes, byte => String.fromCharCode(byte)).join('');

const isModelFile = (listed: unknown): listed is ModelFile =>
  typeof listed === 'object' &&
  listed !== null &&
  typeof (listed as ModelFile).name === 'string' &&
  typeof (listed as ModelFile).url === 'string' &&
  typeof (listed as ModelFile).size === 'number';

/** Keeps the list of the model's files beside them. */
export const keepFileList = (store: ModelFileStore, files: readonly ModelFile[]): Promise<void> =>
  store.put(MOONSHINE_FILE_LIST, toBytes(JSON.stringify(files)));

/** The model's files as they were listed when it was downloaded; nothing if it never was. */
export const keptFileList = async (store: ModelFileStore): Promise<ModelFile[] | undefined> => {
  const kept = await store.get(MOONSHINE_FILE_LIST);
  if (!kept) {
    return undefined;
  }
  try {
    const listed: unknown = JSON.parse(fromBytes(kept));
    return Array.isArray(listed) && listed.length > 0 && listed.every(isModelFile)
      ? listed
      : undefined;
  } catch {
    return undefined;
  }
};

export interface MoonshineOptions {
  /** Where the model's files are kept: the browser's Cache API. */
  store?: ModelFileStore;
  /** Fetches the adapter's chunk. */
  adapter?: () => Promise<MoonshineAdapter>;
}

/**
 * Fetches Moonshine's files from its publisher's CDN into the browser's cache,
 * proves the model loads, and says whether the files are still there.
 */
export const createMoonshineDownloader = ({
  store = createCacheFileStore(MOONSHINE_CACHE),
  adapter = importAdapter,
}: MoonshineOptions = {}): ModelDownloader => ({
  download: (_model, options) => adapter().then(moonshine => moonshine.download(store, options)),
  testLoad: () => adapter().then(moonshine => moonshine.testLoad(store)),
  has: async () => {
    try {
      const files = await keptFileList(store);
      if (!files) {
        return false;
      }
      const held = await Promise.all(files.map(file => store.has(file.url)));
      return held.every(Boolean);
    } catch {
      return false;
    }
  },
  remove: () => store.clear(),
});

/** The speech port Moonshine hears a Ramble through, once its files are on the phone. */
export const createMoonshineSpeech = ({
  store = createCacheFileStore(MOONSHINE_CACHE),
  adapter = importAdapter,
}: MoonshineOptions = {}): SpeechPort =>
  createLazySpeech(() => adapter().then(moonshine => moonshine.createSpeech(store)));
