/**
 * The compare read: two cooks, each read whole, held in the A and B slots.
 *
 * Compare is the one screen that needs everything about a cook at once — what
 * was planned, what happened, what was stamped on it and how it scored — for
 * two cooks side by side. There is no aggregate for that on the backend and
 * deliberately none added: this hook composes the reads that already exist (the
 * cook's description, which carries its timing with it; the cook log by smoke
 * id; and the decimated chart series by the cook's temps id) into one value per
 * slot.
 *
 * What it never reads is the raw temperature log. A cook's readings reach this
 * screen as the decimated series — a few hundred chart points rather than the
 * tens of thousands a twelve-hour cook holds — which is the whole reason that
 * endpoint exists, and why the description read is composed here rather than
 * the review read the detail screen uses.
 *
 * The composition is per cook, not per pair, so a cook that could not be read
 * fails its own slot; and the pair's status is the worse of the two, because a
 * comparison with one side missing is not a comparison.
 *
 * Which loaded cook is in which slot is this hook's to say, which is what makes
 * {@link UseCompareResult.swap} free: swapping exchanges the two cooks the hook
 * is already holding, and reads nothing again.
 */
import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from './ApiClientProvider';
import type { ApiClient } from './client';
import {
  CookEvent,
  PostSmoke,
  PreSmoke,
  SmokeProfile,
  SmokeTimeline,
  TempSample,
  rating,
} from './types';

/** How many points a compare chart is drawn from — the endpoint's own default. */
export const COMPARE_SERIES_POINTS = 300;

/** One cook, as compare needs it: everything about it, in one value. */
export interface CompareCook {
  smokeId: string;
  /** What the cook was called, or an empty string for one nobody named. */
  name: string;
  /** The day it was cooked; `null` for a record with no usable date. */
  date: Date | null;
  preSmoke: PreSmoke;
  smokeProfile: SmokeProfile;
  postSmoke: PostSmoke;
  rating: rating;
  /** The cook's timing and extremes; `null` for a cook too old to have any. */
  timeline: SmokeTimeline | null;
  /** What was stamped on the cook, oldest first; empty for an unstamped cook. */
  events: CookEvent[];
  /** The cook thinned to a chart's worth of points; empty when nothing was recorded. */
  series: TempSample[];
}

/**
 * How the pair is doing: nothing asked for yet, still arriving, both here, or a
 * cook that could not be read at all.
 */
export type CompareStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface UseCompareResult {
  status: CompareStatus;
  /** The cook in the A slot, or `null` while it is arriving or after it failed. */
  a: CompareCook | null;
  /** The cook in the B slot, same. */
  b: CompareCook | null;
  /** Exchanges the two slots. Reads nothing: both cooks are already held. */
  swap: () => void;
}

/**
 * One cook read whole.
 *
 * The log and the record are asked for together; the series can only be asked
 * for once the record has said which temps id the cook stored its readings
 * under. Neither the log nor the series can fail the cook: an unstamped cook and
 * one whose readings could not be fetched are both comparable, they are just
 * comparable with less on the screen. The record itself is the cook — without it
 * there is nothing to put in the slot — so its failure is the read's failure.
 *
 * The cook is described rather than reviewed: the review read would drag the
 * whole raw log of both cooks over the wire before the screen could paint, and
 * nothing here would ever look at it.
 */
const readCook = async (client: ApiClient, smokeId: string): Promise<CompareCook> => {
  const [review, events] = await Promise.all([
    client.smoke.getSummary(smokeId),
    client.cookEvents.listForSmoke(smokeId).catch((): CookEvent[] => []),
  ]);
  const tempsId = review.smoke.tempsId;
  const series = tempsId
    ? await client.temps.getSeries(tempsId, COMPARE_SERIES_POINTS).catch((): TempSample[] => [])
    : [];
  const day = review.smoke.date ? new Date(review.smoke.date) : null;

  return {
    smokeId,
    name: review.preSmoke.name ?? '',
    date: day === null || Number.isNaN(day.getTime()) ? null : day,
    preSmoke: review.preSmoke,
    smokeProfile: review.smokeProfile,
    postSmoke: review.postSmoke,
    rating: review.rating,
    timeline: review.timeline,
    events,
    series,
  };
};

/** What one slot's read is, at any moment. */
interface SlotRead {
  status: CompareStatus;
  cook: CompareCook | null;
}

const NOTHING_ASKED: SlotRead = { status: 'idle', cook: null };

/** One cook, read and re-read as the id in that slot changes. */
const useCompareCook = (smokeId: string | undefined): SlotRead => {
  const client = useApiClient();
  const [read, setRead] = useState<SlotRead>(NOTHING_ASKED);

  useEffect(() => {
    let reading = true;
    if (!smokeId) {
      setRead(NOTHING_ASKED);
      return () => {
        reading = false;
      };
    }
    setRead({ status: 'loading', cook: null });
    void readCook(client, smokeId)
      .then(cook => {
        if (reading) setRead({ status: 'ready', cook });
      })
      .catch(() => {
        if (reading) setRead({ status: 'failed', cook: null });
      });
    return () => {
      reading = false;
    };
  }, [client, smokeId]);

  return read;
};

/**
 * The worse of the two slots: a pair is only ready once both cooks are, and a
 * pair with a cook that could not be read is a failure however well the other
 * one read.
 */
const pairStatus = (one: CompareStatus, other: CompareStatus): CompareStatus => {
  if (one === 'failed' || other === 'failed') return 'failed';
  if (one === 'idle' || other === 'idle') return 'idle';
  if (one === 'loading' || other === 'loading') return 'loading';
  return 'ready';
};

export function useCompare(
  smokeIdA: string | undefined,
  smokeIdB: string | undefined
): UseCompareResult {
  const first = useCompareCook(smokeIdA);
  const second = useCompareCook(smokeIdB);
  const [swapped, setSwapped] = useState(false);
  const swap = useCallback(() => setSwapped(exchanged => !exchanged), []);

  // Swapping is about the two cooks in hand, so it does not outlive them: when
  // either id changes, the cook just chosen belongs in the slot it was chosen
  // for, not in the other one because of a swap made about a different pair.
  useEffect(() => {
    setSwapped(false);
  }, [smokeIdA, smokeIdB]);

  return {
    status: pairStatus(first.status, second.status),
    a: swapped ? second.cook : first.cook,
    b: swapped ? first.cook : second.cook,
    swap,
  };
}
