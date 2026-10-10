/**
 * Gemma 4 E2B, as much of it as the application carries from the start: where
 * its file is hosted and kept on the phone, whether it is still there, and the
 * downloader and the extractor port that reach for the rest only when asked.
 *
 * The rest — the adapter and the LiteRT-LM runtime it drives — is in a chunk of
 * its own. A download or a test-load fetches that chunk, and so does the first
 * Ramble; opening the app, asking whether the model is on the phone, or
 * removing it, does not.
 */
import type { ModelDownloader } from './modelLibrary';
import type { ModelPartStore, PartedFile } from './modelParts';
import { createCachePartStore, hasEveryPart } from './modelParts';
import { createLazyExtractor } from './modelPorts';
import { GEMMA_4_E2B } from './modelRegistry';
import type { ExtractorPort } from './ports';

/** The browser cache Gemma's file is kept in, a part at a time. */
export const GEMMA_CACHE = 'voiceFill.gemma';

/**
 * The model's one file, on Hugging Face: the web build LiteRT-LM JS runs. It
 * is asked for at the revision whose size the registry lists, so a later
 * upload to the repository is never taken for a download that arrived the
 * wrong size.
 */
export const GEMMA_FILE: PartedFile = {
  url:
    'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/' +
    'b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1/gemma-4-E2B-it-web.litertlm',
  size: GEMMA_4_E2B.sizeBytes,
};

type LiteRtAdapter = Pick<
  typeof import('./liteRtAdapter'),
  'download' | 'testLoad' | 'createExtractor'
>;

const importAdapter = (): Promise<LiteRtAdapter> =>
  import(/* webpackChunkName: "voice-fill-litert" */ './liteRtAdapter');

export interface GemmaOptions {
  /** Where the model's file is kept: the browser's Cache API. */
  store?: ModelPartStore;
  /** Fetches the adapter's chunk. */
  adapter?: () => Promise<LiteRtAdapter>;
}

/**
 * Fetches Gemma's file from Hugging Face into the browser's cache, proves the
 * model loads, and says whether the file is still there.
 */
export const createGemmaDownloader = ({
  store = createCachePartStore(GEMMA_CACHE),
  adapter = importAdapter,
}: GemmaOptions = {}): ModelDownloader => ({
  download: (_model, options) =>
    adapter().then(liteRt => liteRt.download(GEMMA_FILE, store, options)),
  testLoad: () => adapter().then(liteRt => liteRt.testLoad(GEMMA_FILE, store)),
  has: () => hasEveryPart(GEMMA_FILE, store).catch(() => false),
  remove: () => store.clear(),
});

/** The extractor port Gemma reads a Ramble through, once its file is on the phone. */
export const createGemmaExtractor = ({
  store = createCachePartStore(GEMMA_CACHE),
  adapter = importAdapter,
}: GemmaOptions = {}): ExtractorPort =>
  createLazyExtractor(() => adapter().then(liteRt => liteRt.createExtractor(GEMMA_FILE, store)));
