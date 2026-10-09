/**
 * The Model library: the per-phone record of which speech and extraction
 * models are picked, downloaded and proven to run.
 *
 * It owns everything about getting a model onto the phone — the download that
 * starts by itself the first time the app is opened, the one a pick starts,
 * pausing while the phone is offline, going on by itself after a download
 * breaks, picking up again when the app is reopened, and the one test-load that decides whether a downloaded model is
 * "Ready to use" or "Didn't work on this phone" — behind a downloader it is
 * handed, so none of it knows where a model's files come from.
 *
 * What it records is kept in the storage it is handed, on the phone. Nothing
 * of it goes to the application settings the backend shares between devices:
 * two phones pick, download and prove their models independently.
 */
import type { ModelPair, ModelRegistry, ModelRole, VoiceFillModel } from './modelRegistry';
import { MODEL_ROLES } from './modelRegistry';

/** Where one model stands on this phone. */
export type ModelStatus =
  | { state: 'notDownloaded' }
  /** Arriving. A model that has all arrived stays here until its test-load ends. */
  | { state: 'downloading'; receivedBytes: number }
  /**
   * Part-way and stopped, with what had arrived kept: waiting for the phone to
   * be back online, or for the next try after a download that broke.
   */
  | { state: 'paused'; receivedBytes: number }
  /** Downloaded, and loaded once on this phone to prove it runs. */
  | { state: 'ready' }
  /** Downloaded, and it could not be loaded on this phone. */
  | { state: 'failed' };

export interface ModelLibraryState {
  /**
   * Whether this phone can run Voice Fill at all; `null` until that has been
   * checked. Anything but `true` means no button, no pill and no settings card.
   */
  supported: boolean | null;
  /** The pair Voice Fill runs a Ramble through. */
  picked: ModelPair;
  /** Every registered model's status, by model id. */
  statuses: Readonly<Record<string, ModelStatus>>;
}

/** Fetches, proves and deletes a model's files. The real ones arrive with the adapters. */
export interface ModelDownloader {
  /**
   * Fetches what the phone does not yet hold of `model`, reporting how many of
   * its bytes are on the phone as they arrive. Resolves once it is all there;
   * rejects if it cannot go on, or when `signal` stops it — what had arrived
   * stays, for the next call to pick up from.
   */
  download(
    model: VoiceFillModel,
    options: { onProgress: (receivedBytes: number) => void; signal: AbortSignal }
  ): Promise<void>;
  /** Loads the downloaded `model` once and lets it go: whether it runs on this phone. */
  testLoad(model: VoiceFillModel): Promise<boolean>;
  /** Whether the whole of `model` is still on the phone: a browser may evict it. */
  has(model: VoiceFillModel): Promise<boolean>;
  /**
   * Deletes whatever the phone holds of `model`. The library does not ask for
   * the model again until this has settled.
   */
  remove(model: VoiceFillModel): Promise<void>;
}

/** Whether the phone is online, and when that changes. */
export interface ConnectionPort {
  isOnline(): boolean;
  /** Calls `listener` whenever the phone goes offline or comes back. */
  subscribe(listener: () => void): () => void;
}

export interface ModelLibraryOptions {
  registry: ModelRegistry;
  downloader: ModelDownloader;
  /** Where the record is kept on the phone: the browser's local storage. */
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  /** Whether this phone can run Voice Fill: see `canRunVoiceFill`. */
  capabilities: () => Promise<boolean>;
  connection?: ConnectionPort;
  /**
   * What the record is kept under in `storage`. A library over models that
   * are not the application's real ones takes a key of its own, so neither
   * ever reads the other's record.
   */
  storageKey?: string;
  /**
   * How long a download that broke with the phone still online waits before
   * it is tried again, in ms. Each break in a row doubles the wait, up to
   * {@link MAX_RETRY_DELAY_MS}.
   */
  retryDelayMs?: number;
}

export interface ModelLibrary {
  readonly registry: ModelRegistry;
  getState(): ModelLibraryState;
  /** Calls `listener` after every change of state. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /**
   * What happens when the app is opened, on whichever screen: the phone is
   * checked, and where it can run Voice Fill the default pair starts
   * downloading if the app was never opened here before, and any download the
   * last closing of the app cut short — or left broken — is picked up.
   */
  open(): Promise<void>;
  /** Stops every download where it is, to be picked up by the next `open`. */
  close(): void;
  /** Makes `id` the picked model of `role`, and starts its download. */
  pick(role: ModelRole, id: string): void;
  /** Starts, or picks up, the download of `id`. */
  download(id: string): void;
  /** Stops the download of `id` and discards what had arrived. */
  cancel(id: string): void;
  /** Deletes `id` from the phone: it is not downloaded again until asked for. */
  remove(id: string): void;
}

/** What the record is kept under in the phone's storage. */
export const MODEL_LIBRARY_STORAGE_KEY = 'voiceFill.modelLibrary';

interface StoredRecord {
  picked: ModelPair;
  statuses: Record<string, ModelStatus>;
}

const ALWAYS_ONLINE: ConnectionPort = {
  isOnline: () => true,
  subscribe: () => () => undefined,
};

/** How long a download that broke waits before its first retry, in ms. */
export const RETRY_DELAY_MS = 5_000;

/** The longest a download that keeps breaking waits between two tries, in ms. */
export const MAX_RETRY_DELAY_MS = 60_000;

/** What a model nothing is known of stands at. */
export const NOT_DOWNLOADED: ModelStatus = { state: 'notDownloaded' };

/** Whether a model is on its way to the phone: downloading, or paused part-way. */
export const isArriving = (
  status: ModelStatus
): status is Extract<ModelStatus, { state: 'downloading' | 'paused' }> =>
  status.state === 'downloading' || status.state === 'paused';

/**
 * Whether the whole of a model is on the phone, taking its storage: one that
 * is ready, and just as much one that could not be loaded here.
 */
export const isDownloaded = (status: ModelStatus): boolean =>
  status.state === 'ready' || status.state === 'failed';

/** How much of `sizeBytes` has arrived, as the whole percent every screen shows. */
export const percentOf = (receivedBytes: number, sizeBytes: number): number =>
  Math.floor((100 * receivedBytes) / sizeBytes);

/** Where `model` stands on this phone; not downloaded where there is no such model. */
export const statusOf = (
  { statuses }: Pick<ModelLibraryState, 'statuses'>,
  model: VoiceFillModel | undefined
): ModelStatus => (model && statuses[model.id]) || NOT_DOWNLOADED;

/** The model picked for `role`; none where no model of that role is registered. */
export const pickedModel = (
  registry: ModelRegistry,
  { picked }: Pick<ModelLibraryState, 'picked'>,
  role: ModelRole
): VoiceFillModel | undefined => registry.find(picked[role]);

const readRecord = (
  storage: Pick<Storage, 'getItem'>,
  storageKey: string
): Partial<StoredRecord> | null => {
  try {
    const stored: unknown = JSON.parse(storage.getItem(storageKey) ?? 'null');
    return typeof stored === 'object' && stored !== null ? (stored as Partial<StoredRecord>) : null;
  } catch {
    return null;
  }
};

/** A status as it was stored, if it is one a model can be in. */
const storedStatus = (stored: ModelStatus | undefined, model: VoiceFillModel): ModelStatus => {
  switch (stored?.state) {
    case 'ready':
    case 'failed':
      return { state: stored.state };
    case 'downloading':
    case 'paused': {
      const received = Number(stored.receivedBytes);
      return {
        state: 'downloading',
        receivedBytes: Number.isFinite(received)
          ? Math.min(Math.max(received, 0), model.sizeBytes)
          : 0,
      };
    }
    default:
      return NOT_DOWNLOADED;
  }
};

export const createModelLibrary = ({
  registry,
  downloader,
  storage,
  capabilities,
  connection = ALWAYS_ONLINE,
  storageKey = MODEL_LIBRARY_STORAGE_KEY,
  retryDelayMs = RETRY_DELAY_MS,
}: ModelLibraryOptions): ModelLibrary => {
  const record = readRecord(storage, storageKey);
  const pickedOr = (role: ModelRole): string | null =>
    registry.find(record?.picked?.[role] ?? null)?.role === role
      ? (record?.picked?.[role] ?? null)
      : registry.defaultPair[role];

  let supported: boolean | null = null;
  let picked: ModelPair = { speech: pickedOr('speech'), extractor: pickedOr('extractor') };
  let statuses: Record<string, ModelStatus> = Object.fromEntries(
    registry.models.map(model => [model.id, storedStatus(record?.statuses?.[model.id], model)])
  );
  let state: ModelLibraryState = { supported, picked, statuses };

  const listeners = new Set<() => void>();
  /** The downloads under way, each with what stops it. */
  const inFlight = new Map<string, AbortController>();
  /**
   * The models that have all arrived and are being test-loaded. They are still
   * in flight, but there is no download left in them for a connection to stop.
   */
  const proving = new Set<string>();
  /** The deletes under way: a model is not fetched again until its own has settled. */
  const deleting = new Map<string, Promise<void>>();
  /** The downloads that broke and are waiting to be tried again. */
  const retrying = new Map<string, ReturnType<typeof setTimeout>>();
  /** How many times in a row each model's download has broken with nothing arriving. */
  const breaks = new Map<string, number>();
  /** Which opening of the app is current: an answer to an earlier one is stale. */
  let opening = 0;
  let isOpen = false;
  let stopListening: (() => void) | undefined;

  const persist = (): void => {
    try {
      storage.setItem(storageKey, JSON.stringify({ picked, statuses }));
    } catch {
      // Storage that is full or refused loses the record at the next reload,
      // not the download under way.
    }
  };

  const emit = (): void => {
    state = { supported, picked, statuses };
    listeners.forEach(listener => listener());
  };

  const arrivedPercent = (status: ModelStatus, model: VoiceFillModel): number =>
    isArriving(status) ? percentOf(status.receivedBytes, model.sizeBytes) : -1;

  const setStatus = (model: VoiceFillModel, next: ModelStatus): void => {
    const previous = statuses[model.id];
    statuses = { ...statuses, [model.id]: next };
    // Progress arrives far more often than it is worth writing down: the record
    // is rewritten when a model changes state or gains a whole percent.
    if (
      previous.state !== next.state ||
      arrivedPercent(previous, model) !== arrivedPercent(next, model)
    ) {
      persist();
    }
    emit();
  };

  const forgetRetry = (id: string): void => {
    clearTimeout(retrying.get(id));
    retrying.delete(id);
  };

  const stop = (id: string): void => {
    forgetRetry(id);
    const controller = inFlight.get(id);
    inFlight.delete(id);
    proving.delete(id);
    controller?.abort();
  };

  /** Deletes what the phone holds of `model`, after any delete of it already under way. */
  const deleteFromPhone = (model: VoiceFillModel): void => {
    const deleted: Promise<void> = (deleting.get(model.id) ?? Promise.resolve())
      .then(() => downloader.remove(model))
      .catch(() => undefined)
      .then(() => {
        if (deleting.get(model.id) === deleted) {
          deleting.delete(model.id);
        }
      });
    deleting.set(model.id, deleted);
  };

  const fetchAndProve = async (model: VoiceFillModel): Promise<void> => {
    const controller = new AbortController();
    inFlight.set(model.id, controller);
    // A download that was cancelled, paused or closed has nothing more to say.
    const isCurrent = (): boolean => inFlight.get(model.id) === controller;

    // A model that is still being deleted is fetched once it has gone, so the
    // delete cannot take what this download brings.
    const beingDeleted = deleting.get(model.id);
    if (beingDeleted) {
      await beingDeleted;
      if (!isCurrent()) {
        return;
      }
    }

    try {
      await downloader.download(model, {
        signal: controller.signal,
        onProgress: receivedBytes => {
          if (isCurrent()) {
            breaks.delete(model.id);
            setStatus(model, {
              state: 'downloading',
              receivedBytes: Math.min(receivedBytes, model.sizeBytes),
            });
          }
        },
      });
    } catch {
      if (isCurrent()) {
        inFlight.delete(model.id);
        const reached = statuses[model.id];
        // A download that broke is paused, never given up: what had arrived is
        // kept, on the phone and in the record, for the next try to go on from.
        setStatus(model, {
          state: 'paused',
          receivedBytes: isArriving(reached) ? reached.receivedBytes : 0,
        });
        // One the phone went offline under waits for it to come back. One that
        // broke with the phone still online — a server error, a connection
        // gone before the browser has noticed — is tried again by itself.
        if (connection.isOnline()) {
          retryLater(model.id);
        }
      }
      return;
    }
    if (!isCurrent()) {
      return;
    }
    setStatus(model, { state: 'downloading', receivedBytes: model.sizeBytes });

    // Ready means proven: the model is loaded once, here, before it is offered.
    proving.add(model.id);
    let runsHere = false;
    try {
      runsHere = await downloader.testLoad(model);
    } catch {
      runsHere = false;
    }
    if (!isCurrent()) {
      return;
    }
    inFlight.delete(model.id);
    proving.delete(model.id);
    setStatus(model, { state: runsHere ? 'ready' : 'failed' });
  };

  const begin = (id: string | null): void => {
    const model = registry.find(id);
    if (!model || inFlight.has(model.id)) {
      return;
    }
    forgetRetry(model.id);
    const status = statuses[model.id];
    if (status.state === 'ready' || status.state === 'failed') {
      return;
    }
    const receivedBytes = isArriving(status) ? status.receivedBytes : 0;
    if (!connection.isOnline()) {
      setStatus(model, { state: 'paused', receivedBytes });
      return;
    }
    setStatus(model, { state: 'downloading', receivedBytes });
    void fetchAndProve(model);
  };

  /** Tries the broken download of `id` again, after a wait that grows with each break. */
  function retryLater(id: string): void {
    const brokenBefore = breaks.get(id) ?? 0;
    breaks.set(id, brokenBefore + 1);
    forgetRetry(id);
    retrying.set(
      id,
      setTimeout(
        () => {
          retrying.delete(id);
          if (statuses[id].state === 'paused') {
            begin(id);
          }
        },
        Math.min(retryDelayMs * 2 ** brokenBefore, MAX_RETRY_DELAY_MS)
      )
    );
  }

  const discard = (id: string): void => {
    const model = registry.find(id);
    if (!model || statuses[model.id].state === 'notDownloaded') {
      return;
    }
    stop(model.id);
    breaks.delete(model.id);
    setStatus(model, NOT_DOWNLOADED);
    deleteFromPhone(model);
  };

  const onConnectionChange = (): void => {
    if (connection.isOnline()) {
      registry.models
        .filter(model => statuses[model.id].state === 'paused')
        .forEach(model => begin(model.id));
      return;
    }
    // A model being test-loaded has all arrived: going offline has nothing of
    // it to pause, and pausing it would have it loaded a second time on return.
    Array.from(inFlight.keys())
      .filter(id => !proving.has(id))
      .forEach(id => {
        const model = registry.find(id);
        const status = statuses[id];
        stop(id);
        if (model && isArriving(status)) {
          setStatus(model, { state: 'paused', receivedBytes: status.receivedBytes });
        }
      });
  };

  const open = async (): Promise<void> => {
    if (isOpen) {
      return;
    }
    isOpen = true;
    opening += 1;
    const thisOpening = opening;
    // Read before anything is written: no record means the app was never
    // opened on this phone. It is the first opening that downloads by itself,
    // not every opening that finds nothing downloaded: a model the user
    // cancelled or removed is not fetched again until asked for, and one whose
    // download broke is still in the record as arriving, to be picked up below.
    const isFirstOpen = readRecord(storage, storageKey) === null;

    let capable = false;
    try {
      capable = await capabilities();
    } catch {
      capable = false;
    }
    if (thisOpening !== opening) {
      return;
    }
    supported = capable;
    emit();
    if (!capable) {
      return;
    }

    stopListening = connection.subscribe(onConnectionChange);
    if (isFirstOpen) {
      persist();
      MODEL_ROLES.forEach(role => begin(picked[role]));
      return;
    }
    registry.models.forEach(model => {
      const status = statuses[model.id];
      if (isArriving(status)) {
        begin(model.id);
      } else if (status.state !== 'notDownloaded') {
        // What the browser evicted since is simply not downloaded any more.
        downloader.has(model).then(
          held => {
            if (!held && thisOpening === opening && statuses[model.id] === status) {
              setStatus(model, NOT_DOWNLOADED);
            }
          },
          () => undefined
        );
      }
    });
  };

  const close = (): void => {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    opening += 1;
    stopListening?.();
    stopListening = undefined;
    Array.from(retrying.keys()).forEach(forgetRetry);
    Array.from(inFlight.keys()).forEach(stop);
  };

  return {
    registry,
    getState: () => state,
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open,
    close,
    pick: (role, id) => {
      const model = registry.find(id);
      if (!model || model.role !== role) {
        return;
      }
      picked = { ...picked, [role]: model.id };
      persist();
      emit();
      begin(model.id);
    },
    download: begin,
    cancel: id => {
      const model = registry.find(id);
      if (model && isArriving(statuses[model.id])) {
        discard(model.id);
      }
    },
    remove: discard,
  };
};

/** Whether the picked pair can take a Ramble, and how far off it is if not. */
export type PairReadiness =
  | { state: 'ready' }
  /** `percent` of the picked pair's bytes are on the phone. */
  | { state: 'downloading'; percent: number }
  | { state: 'notDownloaded' };

export const pairReadiness = (
  registry: ModelRegistry,
  { picked, statuses }: Pick<ModelLibraryState, 'picked' | 'statuses'>
): PairReadiness => {
  const pair = MODEL_ROLES.map(role => pickedModel(registry, { picked }, role));
  const standing = (model: VoiceFillModel | undefined): ModelStatus =>
    statusOf({ statuses }, model);

  if (pair.every(model => standing(model).state === 'ready')) {
    return { state: 'ready' };
  }
  if (!pair.some(model => isArriving(standing(model)))) {
    return { state: 'notDownloaded' };
  }
  let total = 0;
  let onPhone = 0;
  pair.forEach(model => {
    const status = standing(model);
    if (!model) {
      return;
    }
    total += model.sizeBytes;
    if (status.state === 'ready') {
      onPhone += model.sizeBytes;
    } else if (isArriving(status)) {
      onPhone += status.receivedBytes;
    }
  });
  return { state: 'downloading', percent: percentOf(onPhone, total) };
};
