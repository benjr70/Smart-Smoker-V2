/**
 * The step diff, as a pitmaster reads it: what both cooks did, what only one of
 * them did, and — above it — the one figure that section turns on.
 *
 * Rendered directly rather than through the compare screen because the card is
 * shared by the pre- and post-smoke sections: the behaviour worth pinning is the
 * card's own, whichever section is asking for it.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { DesignSurface, appTheme, carbonLight } from '../../../theme';
import { NOT_RECORDED } from '../../common/timeFormat';
import { CompareStepDiff, CompareStepDiffProps } from './CompareStepDiff';

const colors = { a: carbonLight.probes.probe2, b: carbonLight.probes.chamber };

const renderDiff = (props: Partial<CompareStepDiffProps> = {}) =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <CompareStepDiff
          testId="compare-diff-pre"
          section="1"
          title="PRE-SMOKE"
          headlineLabel="Wood"
          headlineA="Hickory"
          headlineB="Oak"
          aSteps={['Trim', 'Rub']}
          bSteps={['Trim', 'Brine']}
          colors={colors}
          {...props}
        />
      </DesignSurface>
    </CssVarsProvider>
  );

describe('CompareStepDiff', () => {
  test('groups the steps into shared, A-only and B-only, each in its colour', () => {
    renderDiff();

    const shared = screen.getByTestId('compare-diff-same');
    expect(shared).toHaveTextContent('SAME IN BOTH · 1');
    expect(shared).toHaveTextContent('Trim');

    const onlyA = screen.getByTestId('compare-diff-only-a');
    expect(onlyA).toHaveTextContent('ONLY COOK A');
    expect(onlyA).toHaveTextContent('Rub');
    expect(within(onlyA).getByTestId('compare-diff-group-label')).toHaveStyle({
      color: carbonLight.probes.probe2,
    });

    const onlyB = screen.getByTestId('compare-diff-only-b');
    expect(onlyB).toHaveTextContent('Brine');
    expect(within(onlyB).getByTestId('compare-diff-group-label')).toHaveStyle({
      color: carbonLight.probes.chamber,
    });

    expect(screen.queryByTestId('compare-diff-identical')).toBeNull();
  });

  /**
   * An empty diff is a finding — the two cooks were prepared the same way — and
   * a card that just stops after the shared group reads as one that failed.
   */
  test('two cooks prepared the same way are told so', () => {
    renderDiff({ aSteps: ['Trim', 'Rub'], bSteps: ['rub ', 'TRIM'] });

    expect(screen.getByTestId('compare-diff-identical')).toHaveTextContent(
      'Identical steps in both cooks.'
    );
    expect(screen.getByTestId('compare-diff-same')).toHaveTextContent('SAME IN BOTH · 2');
    expect(screen.queryByTestId('compare-diff-only-a')).toBeNull();
    expect(screen.queryByTestId('compare-diff-only-b')).toBeNull();
  });

  /** Two cooks with nothing in common get no shared band over an empty list. */
  test('two cooks with nothing in common get no shared band', () => {
    renderDiff({ aSteps: ['Trim'], bSteps: ['Brine'] });

    expect(screen.queryByTestId('compare-diff-same')).toBeNull();
    expect(screen.getByTestId('compare-diff-only-a')).toHaveTextContent('Trim');
    expect(screen.getByTestId('compare-diff-only-b')).toHaveTextContent('Brine');
    expect(screen.queryByTestId('compare-diff-identical')).toBeNull();
  });

  /**
   * A cook that logged two spritzes did two things, and the card shows what
   * that cook did rather than a tidied-up version of it.
   */
  test('a step one cook did twice is listed twice', () => {
    renderDiff({ aSteps: ['Spritz', 'spritz'], bSteps: [] });

    const onlyA = screen.getByTestId('compare-diff-only-a');
    expect(within(onlyA).getAllByTestId('compare-diff-bullet')).toHaveLength(2);
    expect(onlyA).toHaveTextContent('Spritz');
    expect(onlyA).toHaveTextContent('spritz');
  });

  /**
   * Two cooks the record is silent about were not prepared the same way; they
   * were prepared unwatched. Calling that "identical" asserts a match nobody
   * recorded — the same inference the headline and the facts table refuse.
   */
  test('a section neither cook wrote a step for says the record is silent', () => {
    renderDiff({ aSteps: [], bSteps: ['   '] });

    expect(screen.getByTestId('compare-diff-no-steps')).toHaveTextContent(
      'Neither cook recorded any steps here.'
    );
    expect(screen.queryByTestId('compare-diff-identical')).toBeNull();
    expect(screen.queryByTestId('compare-diff-same')).toBeNull();
  });

  test('the headline figure is drawn in each cook’s colour when they differ', () => {
    renderDiff();

    const headline = screen.getByTestId('compare-diff-headline');
    expect(headline).toHaveTextContent('Wood');
    expect(within(headline).getByTestId('compare-diff-headline-a')).toHaveStyle({
      color: carbonLight.probes.probe2,
    });
    expect(within(headline).getByTestId('compare-diff-headline-b')).toHaveStyle({
      color: carbonLight.probes.chamber,
    });
  });

  /**
   * A figure both cooks share is not a difference, so it steps back into the
   * quiet colour — the same rule the facts table follows.
   */
  test('a headline figure both cooks share is greyed', () => {
    renderDiff({ headlineA: 'Hickory', headlineB: 'Hickory' });

    const headline = screen.getByTestId('compare-diff-headline');
    expect(within(headline).getByTestId('compare-diff-headline-a')).toHaveStyle({
      color: carbonLight.textSecondary,
    });
    expect(within(headline).getByTestId('compare-diff-headline-b')).toHaveStyle({
      color: carbonLight.textSecondary,
    });
  });

  /**
   * Colour on this card means "these two differ", and a record silent about
   * both cooks' wood records no difference to shout about: two em-dashes in the
   * cooks' own colours would give the least informative row on the card the
   * loudest treatment it has.
   */
  test('a headline figure neither cook recorded is not coloured as a difference', () => {
    renderDiff({ headlineA: NOT_RECORDED, headlineB: NOT_RECORDED });

    const headline = screen.getByTestId('compare-diff-headline');
    expect(within(headline).getByTestId('compare-diff-headline-a')).toHaveStyle({
      color: carbonLight.textSecondary,
    });
    expect(within(headline).getByTestId('compare-diff-headline-b')).toHaveStyle({
      color: carbonLight.textSecondary,
    });
  });

  /** One cook's figure against the other's silence is still a difference. */
  test('a figure only one cook recorded is coloured as a difference', () => {
    renderDiff({ headlineA: 'Hickory', headlineB: NOT_RECORDED });

    const headline = screen.getByTestId('compare-diff-headline');
    expect(within(headline).getByTestId('compare-diff-headline-a')).toHaveStyle({
      color: carbonLight.probes.probe2,
    });
    expect(within(headline).getByTestId('compare-diff-headline-b')).toHaveStyle({
      color: carbonLight.probes.chamber,
    });
  });

  test("each cook's note is shown under its own letter, in its own colour", () => {
    renderDiff({ aNotes: 'Trimmed hard', bNotes: 'Left the cap on' });

    const notes = screen.getByTestId('compare-diff-notes');
    expect(within(notes).getByTestId('compare-diff-note-a')).toHaveTextContent('Trimmed hard');
    expect(within(notes).getByTestId('compare-diff-note-prefix-a')).toHaveStyle({
      color: carbonLight.probes.probe2,
    });
    expect(within(notes).getByTestId('compare-diff-note-prefix-b')).toHaveStyle({
      color: carbonLight.probes.chamber,
    });
  });

  test('a cook nobody wrote a note on contributes no note row', () => {
    renderDiff({ aNotes: 'Trimmed hard', bNotes: '   ' });

    expect(screen.queryByTestId('compare-diff-note-b')).toBeNull();
    expect(screen.getByTestId('compare-diff-note-a')).toBeInTheDocument();
  });

  test('a section neither cook wrote a note for has no notes block at all', () => {
    renderDiff();

    expect(screen.queryByTestId('compare-diff-notes')).toBeNull();
  });

  /** The same card serves the post-smoke section, with its own headline. */
  test('serves the post-smoke section with rest as its headline', () => {
    renderDiff({
      testId: 'compare-diff-post',
      section: '3',
      title: 'POST-SMOKE',
      headlineLabel: 'Rest',
      headlineA: '1h 00m',
      headlineB: '30m',
      aSteps: ['Slice'],
      bSteps: ['Pull'],
    });

    const card = screen.getByTestId('compare-diff-post');
    expect(card).toHaveTextContent('POST-SMOKE');
    expect(card).toHaveTextContent('Rest');
    expect(within(card).getByTestId('compare-diff-headline-a')).toHaveTextContent('1h 00m');
    expect(within(card).getByTestId('compare-diff-only-b')).toHaveTextContent('Pull');
  });
});
