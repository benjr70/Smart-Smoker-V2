/**
 * The segmented control, on its own: what it reports, what it shows as chosen,
 * and how a keyboard moves through it.
 *
 * The colours are asserted against the palette the application is themed from,
 * because "the chosen segment is lifted out of the track" is the whole point of
 * the control — a segment that reported itself selected and looked identical to
 * its neighbours would satisfy every behavioural assertion and none of the
 * design.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { DesignSurface, appTheme, carbonLight } from '../../../theme';
import { SegmentedControl, segmentTabId } from './SegmentedControl';

const options = [
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two' },
  { value: 'three', label: 'Three' },
] as const;

type Choice = (typeof options)[number]['value'];

const showControl = (value: Choice, onChange = jest.fn()) => {
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <SegmentedControl
          options={options}
          value={value}
          onChange={onChange}
          label="Choice"
          panelId="choice-panel"
          testIdPrefix="choice"
        />
        <div
          role="tabpanel"
          id="choice-panel"
          aria-labelledby={segmentTabId('choice-panel', value)}
        >
          What the chosen segment shows
        </div>
      </DesignSurface>
    </CssVarsProvider>
  );

  return onChange;
};

const segment = (label: string) => screen.getByRole('tab', { name: label });

describe('the segmented control', () => {
  it('offers a segment per option and marks the one in effect', () => {
    showControl('two');

    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['One', 'Two', 'Three']);
    expect(segment('Two')).toHaveAttribute('aria-selected', 'true');
    expect(segment('One')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tablist')).toHaveAccessibleName('Choice');
  });

  /**
   * A tab is only a tab because of what it switches: assistive technology
   * offered a tab with no panel behind it announces a relationship that leads
   * nowhere. Each segment therefore points at the region it shows, and carries
   * an id of its own so that region can name the segment back.
   */
  it('points every segment at the region it switches, and can be named back by it', () => {
    showControl('two');

    screen.getAllByRole('tab').forEach(tab => {
      expect(tab).toHaveAttribute('aria-controls', 'choice-panel');
    });
    expect(segment('Two')).toHaveAttribute('id', segmentTabId('choice-panel', 'two'));
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Two');
  });

  it('reports the value of a segment that is chosen, and changes nothing itself', async () => {
    const user = userEvent.setup();
    const onChange = showControl('one');

    await user.click(segment('Three'));

    expect(onChange).toHaveBeenCalledWith('three');
    // Controlled: the caller decides what happens next, so nothing moved here.
    expect(segment('One')).toHaveAttribute('aria-selected', 'true');
  });

  it('lifts the chosen segment out of the track and leaves the rest in it', () => {
    showControl('two');

    expect(segment('Two')).toHaveStyle({
      backgroundColor: carbonLight.surface,
      color: carbonLight.accent,
    });
    expect(getComputedStyle(segment('Two')).boxShadow).not.toMatch(/^(none)?$/);

    expect(segment('One')).toHaveStyle({
      backgroundColor: 'transparent',
      color: carbonLight.textSecondary,
      boxShadow: 'none',
    });
  });

  it('paints the track the surface the segments are lifted out of', () => {
    showControl('one');

    expect(screen.getByRole('tablist')).toHaveStyle({ backgroundColor: carbonLight.surfaceAlt });
  });

  it('reaches the row once from the keyboard, not once per segment', () => {
    showControl('two');

    expect(segment('Two')).toHaveAttribute('tabindex', '0');
    expect(segment('One')).toHaveAttribute('tabindex', '-1');
    expect(segment('Three')).toHaveAttribute('tabindex', '-1');
  });

  it('moves between segments with the arrow keys and to the ends with Home and End', async () => {
    const user = userEvent.setup();
    const onChange = showControl('two');

    segment('Two').focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('three');

    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('one');

    await user.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith('three');

    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith('one');
  });

  it('wraps around the ends rather than stopping at them', async () => {
    const user = userEvent.setup();
    const onChange = showControl('three');

    segment('Three').focus();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenLastCalledWith('one');
  });

  it('names its segments for a test only when it was given a name to use', () => {
    render(
      <CssVarsProvider theme={appTheme} defaultMode="light">
        <DesignSurface>
          <SegmentedControl
            options={options}
            value="one"
            onChange={jest.fn()}
            label="Unnamed choice"
            panelId="unnamed-panel"
          />
        </DesignSurface>
      </CssVarsProvider>
    );

    expect(screen.getByRole('tab', { name: 'One' })).not.toHaveAttribute('data-testid');
  });
});
