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

interface RatingsCardProps {
  ratings: rating;
}

/**
 * The design's Ratings section: four half-step rating bars that persist as
 * they change, with the review notes stored alongside the scores.
 */
export function RatingsCard(props: RatingsCardProps): JSX.Element {
  const client = useApiClient();
  const [ratings, setRatings] = useState<rating>(props.ratings);
  const [saved, setSaved] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();

  // What the backend last agreed the notes say. Editing keystrokes only move
  // local state; the field persists when it is left, and only when leaving it
  // would actually change what is stored.
  const savedNotes = useRef(props.ratings.notes);

  useEffect(() => {
    setRatings(props.ratings);
    savedNotes.current = props.ratings.notes;
  }, [props.ratings]);

  // The flash timer dies with the card: a timeout firing setState on an
  // unmounted component is React's favourite warning.
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  /** Raise the "Ratings saved" flash, restarting its clock on every save. */
  const flashSaved = (): void => {
    setSaved(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSaved(false), SAVED_FLASH_MS);
  };

  const commit = (next: rating): void => {
    setRatings(next);
    if (!next._id) {
      // A review whose rating was never stored has nothing to update; the
      // create path belongs to the post-smoke flow, not the history detail.
      return;
    }
    // The flash confirms the save, so it waits for the save to land; a failure
    // is swallowed-and-logged (the legacy shim's semantics) and never flashes.
    client.ratings
      .save(next)
      .then(flashSaved)
      .catch(error => console.log(error));
  };

  return (
    <DetailSection number="★" title="Ratings" testId="review-ratings-card">
      {BARS.map(({ key, label }) => (
        <RatingBar
          key={key}
          label={label}
          value={ratings[key]}
          onChange={score => commit({ ...ratings, [key]: score })}
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
          onChange={event => setRatings({ ...ratings, notes: event.target.value })}
          onBlur={() => {
            if (ratings.notes !== savedNotes.current) {
              savedNotes.current = ratings.notes;
              commit(ratings);
            }
          }}
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
