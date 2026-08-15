/**
 * The detail sections' note block: what was written about a phase of the cook,
 * shown as the design's labelled quiet block — and not shown at all when
 * nothing was written.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DesignSurface, appTheme } from '../../../theme';
import { NoteBlock } from './NoteBlock';

const showNote = (note: string | undefined) =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <NoteBlock label="Notes" note={note} />
      </DesignSurface>
    </CssVarsProvider>
  );

describe('a detail note block', () => {
  it('shows the note under its label', () => {
    showNote('Wrapped at 165, pushed through the stall.');

    expect(screen.getByTestId('note-block')).toHaveTextContent('Notes');
    expect(screen.getByTestId('note-block')).toHaveTextContent(
      'Wrapped at 165, pushed through the stall.'
    );
  });

  it('shows nothing at all when no note was written', () => {
    showNote('   ');
    expect(screen.queryByTestId('note-block')).not.toBeInTheDocument();

    showNote(undefined);
    expect(screen.queryByTestId('note-block')).not.toBeInTheDocument();
  });
});
