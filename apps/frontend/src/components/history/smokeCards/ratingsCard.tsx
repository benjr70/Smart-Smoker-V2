import { Box, TextField } from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import { rating, useApiClient } from '../../../api';
import { DetailSection } from '../../common/components/DetailSection';
import { FormField } from '../../common/components/FormField';
import { RatingBar } from '../../common/components/RatingBar';

/** The four scores a cook is given, in the order the design lists them. */
const BARS: { key: 'smokeFlavor' | 'seasoning' | 'tenderness' | 'overallTaste'; label: string }[] =
  [
    { key: 'smokeFlavor', label: 'Smoke Flavor' },
    { key: 'seasoning', label: 'Seasoning' },
    { key: 'tenderness', label: 'Tenderness' },
    { key: 'overallTaste', label: 'Overall Taste' },
  ];

/** How long the saved flash stays up, in ms. */
const SAVED_FLASH_MS = 2000;

/**
 * How long a burst of changes settles before one save is sent, in ms.
 *
 * A drag across the bar (or a typing burst in the notes) fires a change per
 * half-step or keystroke; posting each one raced the backend — parallel
 * requests land in any order, so a stale intermediate score could be what
 * stuck. Waiting out the burst sends exactly one save carrying the newest
 * value. Exported so tests advance exactly this long instead of guessing.
 */
export const SAVE_DEBOUNCE_MS = 400;

/** Whether two ratings would store identically: the four scores and the notes. */
const sameRating = (a: rating, b: rating): boolean =>
  BARS.every(({ key }) => a[key] === b[key]) && a.notes === b.notes;

interface RatingsCardProps {
  ratings: rating;
}

/**
 * The design's Ratings section: four half-step rating bars and the review
 * notes stored alongside the scores, all persisting as they change.
 *
 * Every change lands in local state immediately (the bars track the pointer,
 * the notes track the keyboard) and starts the debounce clock; when a burst
 * settles, the newest value — and only it — is saved. A card left before the
 * clock runs out flushes the pending save on unmount, so tapping away
 * mid-burst cannot lose the edit.
 */
export function RatingsCard(props: RatingsCardProps): JSX.Element {
  const client = useApiClient();
  const [ratings, setRatings] = useState<rating>(props.ratings);
  const [saved, setSaved] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  // What the backend last confirmed it stored. Advanced only when a save
  // resolves — a failed save leaves the difference in place, so the next
  // change's save carries the lost edit back out instead of forgetting it.
  const persisted = useRef(props.ratings);

  // The newest unsaved value, waiting out the debounce; null when nothing is.
  const pending = useRef<rating | null>(null);

  // Which save is newest. A response only advances `persisted` (and flashes)
  // when it belongs to the newest request, so overlapping saves resolving out
  // of order cannot mark a stale value as the stored one.
  const saveSeq = useRef(0);

  // Cleared on unmount: the flush's save still runs, but its flash must not
  // touch state the card no longer has.
  const mounted = useRef(true);

  useEffect(() => {
    setRatings(props.ratings);
    persisted.current = props.ratings;
    pending.current = null;
  }, [props.ratings]);

  /** Raise the "Ratings saved" flash, restarting its clock on every save. */
  const flashSaved = (): void => {
    setSaved(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSaved(false), SAVED_FLASH_MS);
  };

  const persist = (next: rating): void => {
    const seq = ++saveSeq.current;
    // The flash confirms the save, so it waits for the save to land; a failure
    // is swallowed-and-logged (the legacy shim's semantics) and never flashes —
    // and never marks the value persisted, so it is retried by the next change.
    client.ratings
      .save(next)
      .then(() => {
        if (seq !== saveSeq.current) {
          return;
        }
        persisted.current = next;
        if (mounted.current) {
          flashSaved();
        }
      })
      .catch(error => console.log(error));
  };

  /** Send the pending value now — unless it matches what is already stored. */
  const flush = (): void => {
    clearTimeout(debounceTimer.current);
    const next = pending.current;
    pending.current = null;
    if (next && !sameRating(next, persisted.current)) {
      persist(next);
    }
  };

  // The unmount teardown must run the newest flush (which closes over the
  // newest client), so it reaches it through a ref refreshed every render.
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(
    () => () => {
      mounted.current = false;
      clearTimeout(flashTimer.current);
      flushRef.current();
    },
    []
  );

  /** Take a changed rating: show it now, save it once the burst settles. */
  const queueSave = (next: rating): void => {
    setRatings(next);
    if (!next._id) {
      // A review whose rating was never stored has nothing to update; the
      // create path belongs to the post-smoke flow, not the history detail.
      return;
    }
    pending.current = next;
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => flushRef.current(), SAVE_DEBOUNCE_MS);
  };

  return (
    <DetailSection number="★" title="Ratings" testId="review-ratings-card">
      {BARS.map(({ key, label }) => (
        <RatingBar
          key={key}
          label={label}
          value={ratings[key]}
          onChange={score => queueSave({ ...ratings, [key]: score })}
          testId={`review-rating-${key}`}
        />
      ))}
      <FormField label="Review Notes" htmlFor="review-rating-notes">
        <TextField
          id="review-rating-notes"
          data-testid="review-rating-notes"
          multiline
          minRows={3}
          size="small"
          value={ratings.notes}
          onChange={event => queueSave({ ...ratings, notes: event.target.value })}
        />
      </FormField>
      {saved && (
        <Box
          role="status"
          data-testid="ratings-saved-flash"
          sx={theme => ({
            alignSelf: 'flex-end',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: theme.design.accent,
          })}
        >
          ✓ Ratings saved
        </Box>
      )}
    </DetailSection>
  );
}
