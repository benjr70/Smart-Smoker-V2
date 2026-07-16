import { BatchTempDto } from '../wire/types';
import { DEFAULT_PROBE_NAMES, SessionError } from './domain';

/**
 * The immutable view of the live session a host renders. Produced only by the
 * store; every state change replaces the whole object (a fresh reference) so a
 * `useSyncExternalStore` binding re-renders on change and never on a no-op.
 */
export interface SessionSnapshot {
  chamberName: string;
  probe1Name: string;
  probe2Name: string;
  probe3Name: string;
  probeTemp1: string;
  probeTemp2: string;
  probeTemp3: string;
  chamberTemp: string;
  smoking: boolean;
  notes: string;
  woodType: string;
  date: Date;
  /** Baseline chart history loaded on start / refresh, reset on clear. */
  initialTemps: BatchTempDto[];
  /** True while the cloud socket reports a live connection. */
  connected: boolean;
  /** The most recent surfaced load failure, or `null` when healthy. */
  lastError: SessionError | null;
}

/**
 * The snapshot a freshly constructed session exposes before any load resolves:
 * default probe names, zeroed temps, not smoking, empty draft and baseline.
 * `now` seeds the initial `date` through the injected clock.
 */
export function createInitialSnapshot(now: Date): SessionSnapshot {
  return {
    chamberName: DEFAULT_PROBE_NAMES.chamberName,
    probe1Name: DEFAULT_PROBE_NAMES.probe1Name,
    probe2Name: DEFAULT_PROBE_NAMES.probe2Name,
    probe3Name: DEFAULT_PROBE_NAMES.probe3Name,
    probeTemp1: '0',
    probeTemp2: '0',
    probeTemp3: '0',
    chamberTemp: '0',
    smoking: false,
    notes: '',
    woodType: '',
    date: now,
    initialTemps: [],
    connected: false,
    lastError: null,
  };
}
