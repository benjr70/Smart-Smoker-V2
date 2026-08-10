/**
 * The bottom bar: the three destinations the application has, the one in
 * effect, and the space it leaves for itself.
 *
 * The bar is rendered for real — themed exactly as the application root themes
 * it — rather than over stand-ins for Material-UI's navigation, its actions,
 * its grid and each icon. The suite this replaced mocked all of those, so what
 * it asserted was that the mocks it had just written rendered what they were
 * written to render: it stayed green whatever the bar itself did, and it
 * hard-coded the label of a destination that has since been renamed.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { DesignSurface, appTheme, carbonLight } from '../../theme';
import { BOTTOM_BAR_HEIGHT, BottomBar } from './bottombar';

const handlers = () => ({
  smokeOnClick: jest.fn(),
  historyOnClick: jest.fn(),
  settingsOnClick: jest.fn(),
});

const showBar = (props = handlers()) => {
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <BottomBar {...props} />
      </DesignSurface>
    </CssVarsProvider>
  );

  return props;
};

const destination = (name: string) => screen.getByRole('button', { name });

/** What a destination reads, as painted: the design sets its labels upper-case. */
const labelOf = (name: string) =>
  within(destination(name)).getByText(name, { selector: 'span' }) as HTMLElement;

describe('the bottom bar', () => {
  it('offers Smoke, History and Settings, and nothing else', () => {
    showBar();

    expect(screen.getAllByRole('button').map(action => action.textContent)).toEqual([
      'Smoke',
      'History',
      'Settings',
    ]);
  });

  it('sets its labels upper-case, as the design does', () => {
    showBar();

    expect(getComputedStyle(labelOf('History')).textTransform).toBe('uppercase');
  });

  it('draws each destination in the design outline icon family', () => {
    showBar();

    ['Smoke', 'History', 'Settings'].forEach(name => {
      const icon = within(destination(name)).getByTestId('design-icon');
      // The design's icons are stroked outlines that take the colour of the
      // destination around them; Material's are filled glyphs that do not.
      expect(icon).toHaveAttribute('stroke', 'currentColor');
      expect(icon).toHaveAttribute('fill', 'none');
    });
  });

  it('goes where a tapped destination goes', async () => {
    const user = userEvent.setup();
    const props = showBar();

    await user.click(destination('History'));
    expect(props.historyOnClick).toHaveBeenCalledTimes(1);
    expect(props.smokeOnClick).not.toHaveBeenCalled();
    expect(props.settingsOnClick).not.toHaveBeenCalled();

    await user.click(destination('Settings'));
    expect(props.settingsOnClick).toHaveBeenCalledTimes(1);

    await user.click(destination('Smoke'));
    expect(props.smokeOnClick).toHaveBeenCalledTimes(1);
  });

  it('tints the destination in effect with the accent, and only that one', async () => {
    const user = userEvent.setup();
    showBar();

    // Smoke is where the application opens.
    expect(destination('Smoke')).toHaveStyle({ color: carbonLight.accent });
    expect(destination('History')).not.toHaveStyle({ color: carbonLight.accent });

    await user.click(destination('History'));

    expect(destination('History')).toHaveStyle({ color: carbonLight.accent });
    expect(destination('Smoke')).not.toHaveStyle({ color: carbonLight.accent });
  });

  it('is painted its own surface, distinct from the cards above it', () => {
    showBar();

    expect(screen.getByTestId('bottom-navigation')).toHaveStyle({
      backgroundColor: carbonLight.navigation,
    });
  });

  it('reserves its height ahead of itself so the content above it is not left underneath', () => {
    showBar();

    const reservation = screen.getByTestId('bottom-bar-reservation');
    const bar = screen.getByTestId('bottom-navigation');

    expect(reservation).toHaveStyle({ height: `${BOTTOM_BAR_HEIGHT}px` });
    expect(reservation.compareDocumentPosition(bar)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('goes nowhere, and does not fail, when a destination has no handler', async () => {
    const user = userEvent.setup();
    render(
      <CssVarsProvider theme={appTheme} defaultMode="light">
        <DesignSurface>
          <BottomBar
            smokeOnClick={undefined as never}
            historyOnClick={jest.fn()}
            settingsOnClick={jest.fn()}
          />
        </DesignSurface>
      </CssVarsProvider>
    );

    await user.click(destination('Smoke'));

    expect(destination('Smoke')).toHaveStyle({ color: carbonLight.accent });
  });
});
