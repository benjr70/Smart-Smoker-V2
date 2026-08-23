import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StaleCookDialog } from './StaleCookDialog';

/**
 * The question itself, asked in isolation.
 *
 * What it is asked *about* is the step's business (see smokeStep.test.tsx); what
 * is here is the question's own manners — that it says what happened, that both
 * answers are offered, and that while the answer is being carried out it cannot
 * be given a second time or escaped out from under.
 */
describe('the auto-stopped cook question', () => {
  const answers = () => ({ onConfirm: jest.fn(), onCancel: jest.fn() });

  test('says what happened and offers both answers', () => {
    render(<StaleCookDialog open {...answers()} />);

    expect(screen.getByText('Previous cook was auto-stopped')).toBeInTheDocument();
    expect(screen.getByTestId('stale-cook-dialog')).toHaveTextContent('never finished');
    expect(screen.getByTestId('stale-cook-confirm')).toHaveTextContent('Finish & start new');
    expect(screen.getByTestId('stale-cook-cancel')).toHaveTextContent('Keep session');
  });

  test('is not asked at all until there is something to ask about', () => {
    render(<StaleCookDialog open={false} {...answers()} />);

    expect(screen.queryByTestId('stale-cook-dialog')).not.toBeInTheDocument();
  });

  test('each answer is given once, to the caller that asked', () => {
    const given = answers();
    render(<StaleCookDialog open {...given} />);

    fireEvent.click(screen.getByTestId('stale-cook-confirm'));
    expect(given.onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('stale-cook-cancel'));
    expect(given.onCancel).toHaveBeenCalledTimes(1);
  });

  test('escaping is the same answer as keeping the session', () => {
    const given = answers();
    render(<StaleCookDialog open {...given} />);

    fireEvent.keyDown(screen.getByTestId('stale-cook-dialog'), { key: 'Escape', code: 'Escape' });

    expect(given.onCancel).toHaveBeenCalledTimes(1);
    expect(given.onConfirm).not.toHaveBeenCalled();
  });

  test('takes no second answer while the first is being carried out', () => {
    const given = answers();
    render(<StaleCookDialog open working {...given} />);

    fireEvent.click(screen.getByTestId('stale-cook-confirm'));
    fireEvent.click(screen.getByTestId('stale-cook-cancel'));
    fireEvent.keyDown(screen.getByTestId('stale-cook-dialog'), { key: 'Escape', code: 'Escape' });

    expect(given.onConfirm).not.toHaveBeenCalled();
    expect(given.onCancel).not.toHaveBeenCalled();
  });
});
