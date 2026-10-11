/**
 * Getting a model Transformers.js runs onto the phone, and reading it back.
 *
 * Such a model is several files in a repository on Hugging Face, the largest
 * of them over a gigabyte, so each is fetched and kept a part at a time (see
 * `modelParts.ts`): a download that breaks goes on from the part it broke in.
 * The list of the files is kept beside them once they have all arrived, so
 * that whether the model is on the phone, and what the runtime is handed when
 * it asks for one of its files, is answered with no network and no runtime.
 *
 * Nothing here imports the runtime, so all of it is run in tests.
 */
import type { FetchInPartsOptions, ModelPartStore, PartedFile } from './modelParts';
import { fetchInParts, hasEveryPart, wholeFile } from './modelParts';

/** One file of a model, as its repository on Hugging Face hosts it. */
export interface HubFile extends PartedFile {
  /** What the runtime knows the file by: its path in the repository. */
  name: string;
}

/**
 * Where a file of the repository `repo` is hosted, and the address the
 * runtime asks for it at. The files are those of the repository as it stands:
 * the runtime looks some of them up there whatever revision it is told.
 */
export const hubFileUrl = (repo: string, name: string): string =>
  `https://huggingface.co/${repo}/resolve/main/${name}`;

/** What the list of a model's files is kept under, beside their parts. */
export const TRANSFORMERS_FILE_LIST = '/voice-fill/transformers/files.json';

const isHubFile = (listed: unknown): listed is HubFile =>
  typeof listed === 'object' &&
  listed !== null &&
  typeof (listed as HubFile).name === 'string' &&
  typeof (listed as HubFile).url === 'string' &&
  typeof (listed as HubFile).size === 'number';

/** Keeps the list of the model's files beside them. */
export const keepFileList = (store: ModelPartStore, files: readonly HubFile[]): Promise<void> =>
  store.put(TRANSFORMERS_FILE_LIST, new Blob([JSON.stringify(files)]).stream());

/** The model's files as they were listed when it was downloaded; nothing if it never was. */
export const keptFileList = async (store: ModelPartStore): Promise<HubFile[] | undefined> => {
  const kept = await store.get(TRANSFORMERS_FILE_LIST);
  if (!kept) {
    return undefined;
  }
  try {
    const listed: unknown = JSON.parse(await kept.text());
    return Array.isArray(listed) && listed.length > 0 && listed.every(isHubFile)
      ? listed
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Fetches every part of `files` the store does not hold yet, a file after the
 * other, and keeps the list of them once they have all arrived. `onProgress`
 * is told how many bytes of the whole model are on the phone.
 *
 * Rejects as {@link fetchInParts} does; what had arrived stays, and the list
 * is not kept, so a model that is part-way here is not taken for one that is.
 */
export const downloadHubFiles = async (
  files: readonly HubFile[],
  { onProgress, ...options }: FetchInPartsOptions
): Promise<void> => {
  let held = 0;
  for (const file of files) {
    const heldBefore = held;
    await fetchInParts(file, {
      ...options,
      onProgress: received => onProgress(heldBefore + received),
    });
    held += file.size;
  }
  await keepFileList(options.store, files);
};

/** Whether the whole of the model kept in `store` is still there. */
export const hasHubFiles = async (store: ModelPartStore): Promise<boolean> => {
  const files = await keptFileList(store);
  if (!files) {
    return false;
  }
  for (const file of files) {
    if (!(await hasEveryPart(file, store))) {
      return false;
    }
  }
  return true;
};

/**
 * The file hosted at `url`, read from whichever of `stores` holds a model it
 * is a file of; nothing where none does. This is what the runtime is answered
 * with when it asks its cache for a file, so a model that was downloaded is
 * loaded from the phone.
 */
export const keptHubFile = async (
  stores: readonly ModelPartStore[],
  url: string
): Promise<Blob | undefined> => {
  for (const store of stores) {
    const file = (await keptFileList(store))?.find(listed => listed.url === url);
    if (file) {
      return wholeFile(file, store);
    }
  }
  return undefined;
};
