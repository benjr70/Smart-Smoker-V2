import React from 'react';
import { PostSmoke } from '../../../api/types';
import { DetailSection } from '../../common/components/DetailSection';
import { FieldGrid } from '../../common/components/FieldGrid';
import { NoteBlock } from '../../common/components/NoteBlock';
import { StepList } from '../../common/components/StepList';
import { formatRestTime } from '../../common/timeFormat';

export interface PostSmokeSectionProps {
  postSmoke: PostSmoke;
}

/**
 * Section 3 of the history detail: what happened after the cook. The rest the
 * wizard recorded as `HH:MM` reads as the design's `1h 30m`, then the post
 * steps and whatever was written about the finish.
 */
export function PostSmokeSection({ postSmoke }: PostSmokeSectionProps): JSX.Element {
  return (
    <DetailSection number="3" title="Post-Smoke" testId="review-postsmoke-section">
      <FieldGrid fields={[{ label: 'Rest Time', value: formatRestTime(postSmoke.restTime) }]} />
      <StepList label="Post Steps" steps={postSmoke.steps} />
      <NoteBlock label="Notes" note={postSmoke.notes} />
    </DetailSection>
  );
}
