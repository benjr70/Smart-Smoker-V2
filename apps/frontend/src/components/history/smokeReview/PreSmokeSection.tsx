import React from 'react';
import { PreSmoke } from '../../../api/types';
import { DetailSection } from '../../common/components/DetailSection';
import { FieldGrid } from '../../common/components/FieldGrid';
import { NoteBlock } from '../../common/components/NoteBlock';
import { StepList } from '../../common/components/StepList';

export interface PreSmokeSectionProps {
  preSmoke: PreSmoke;
  /**
   * The wood the cook ran on. It is recorded on the smoke profile rather than
   * the pre-smoke form, but the design reads it as part of what went in.
   */
  woodType: string | undefined;
}

/**
 * Section 1 of the history detail: what went into the smoker. The pre-smoke
 * form's answers in the field grid — em-dashes where it was never filled in —
 * then the prep steps and whatever was written about the prep.
 */
export function PreSmokeSection({ preSmoke, woodType }: PreSmokeSectionProps): JSX.Element {
  const { weight, unit } = preSmoke.weight;
  const weighed = weight === undefined ? null : `${weight} ${unit ?? ''}`.trim();

  return (
    <DetailSection number="1" title="Pre-Smoke" testId="review-presmoke-section">
      <FieldGrid
        fields={[
          { label: 'Session Name', value: preSmoke.name },
          { label: 'Meat Type', value: preSmoke.meatType },
          { label: 'Weight', value: weighed },
          { label: 'Wood', value: woodType },
        ]}
      />
      <StepList label="Prep Steps" steps={preSmoke.steps} />
      <NoteBlock label="Notes" note={preSmoke.notes} />
    </DetailSection>
  );
}
