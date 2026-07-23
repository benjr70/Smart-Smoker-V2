/**
 * The review-aggregate hook.
 *
 * Collapses the review screen's five-state nested fetch waterfall into a single
 * call: it takes a smoke id and returns the five typed display pieces the review
 * cards render, each with a safe default until (and unless) the aggregate loads.
 * The deep client's {@link ApiClient.smoke.getReview} does the composition —
 * fetching the parent then its five children in parallel, filling any absent
 * child with its typed default — so a single missing piece never blanks the
 * whole screen. A failed parent read keeps the defaults in place and raises the
 * app-root failure snackbar instead of leaving the screen silently empty.
 */
import { useEffect, useState } from 'react';
import { useApiClient } from './ApiClientProvider';
import { useApiSnackbar } from './SnackbarProvider';
import { PostSmoke, PreSmoke, SmokeProfile, TempData, rating } from './types';

export interface UseReviewResult {
  preSmoke: PreSmoke;
  smokeProfile: SmokeProfile;
  temps: TempData[];
  postSmoke: PostSmoke;
  rating: rating;
}

const defaultPreSmoke: PreSmoke = { weight: {}, steps: [] };
const defaultSmokeProfile: SmokeProfile = {
  chamberName: '',
  probe1Name: '',
  probe2Name: '',
  probe3Name: '',
  notes: '',
  woodType: '',
};
const defaultPostSmoke: PostSmoke = { restTime: '', steps: [] };
const defaultRating: rating = {
  smokeFlavor: 0,
  seasoning: 0,
  tenderness: 0,
  overallTaste: 0,
  notes: '',
};

export function useReview(smokeId: string): UseReviewResult {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [review, setReview] = useState<UseReviewResult>({
    preSmoke: defaultPreSmoke,
    smokeProfile: defaultSmokeProfile,
    temps: [],
    postSmoke: defaultPostSmoke,
    rating: defaultRating,
  });

  useEffect(() => {
    let active = true;
    client.smoke
      .getReview(smokeId)
      .then(result => {
        if (active) {
          setReview({
            preSmoke: result.preSmoke,
            smokeProfile: result.smokeProfile,
            temps: result.temps,
            postSmoke: result.postSmoke,
            rating: result.rating,
          });
        }
      })
      .catch(() => {
        notify('Could not load smoke review.');
      });
    return () => {
      active = false;
    };
    // notify is a stable context callback; re-run only when the smoke id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smokeId, client]);

  return review;
}
