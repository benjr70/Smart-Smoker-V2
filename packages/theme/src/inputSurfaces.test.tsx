/**
 * The fill behind a form control, as a rendered field rather than as a token.
 *
 * The design fills every input, textarea and select with `inputBg` — the
 * alternate surface, in either scheme — so that a field reads as a well cut
 * into whatever is behind it: the card it usually sits in, or the page itself
 * on a card-less screen. Material-UI's own outlined control is transparent,
 * which in the dark scheme left every field the colour of the card and all but
 * invisible (#517); filling with the page background instead would have moved
 * the same defect onto the card-less screens.
 *
 * Every variant is covered, because the fill is registered on the input base
 * that all of them are built from rather than on the outlined one alone.
 *
 * These render through the provider the application root uses, so what is
 * asserted is the colour a field actually paints in under a scheme, not the
 * shape of a style override.
 */
import {
  Card,
  Experimental_CssVarsProvider as CssVarsProvider,
  InputBase,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { SupportedColorScheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DesignSurface } from './DesignSurface';
import { appTheme } from './index';
import { stubSystemColorScheme } from './testing/systemColorScheme';
import { carbonDark, carbonLight } from './tokens';

/**
 * The design's form controls, painted by the scheme in effect: the ones a card
 * holds, and — as the pre-smoke form and the history header do — the ones a
 * screen puts straight onto the page.
 */
const renderFormUnder = (scheme: SupportedColorScheme): void => {
  render(
    <CssVarsProvider theme={appTheme} defaultMode={scheme}>
      <DesignSurface>
        <Card>
          <TextField data-testid="name" size="small" defaultValue="Sunday brisket" />
          <TextField data-testid="notes" multiline minRows={2} defaultValue="Wrapped at 165" />
          <Select data-testid="unit" size="small" value="lb">
            <MenuItem value="lb">lb</MenuItem>
          </Select>
          <TextField data-testid="wood" variant="filled" defaultValue="Hickory" />
          <TextField data-testid="weight" variant="standard" defaultValue="12" />
          <InputBase data-testid="search" defaultValue="brisket" />
        </Card>
      </DesignSurface>
    </CssVarsProvider>
  );
};

/** The element a control's fill is painted on: the input base's root. */
const control = (testId: string): HTMLElement => {
  const root = screen.getByTestId(testId);
  return (root.querySelector('.MuiInputBase-root') as HTMLElement) ?? root;
};

describe('the fill behind a form control', () => {
  let system: ReturnType<typeof stubSystemColorScheme>;

  beforeEach(() => {
    system = stubSystemColorScheme();
    localStorage.clear();
  });
  afterEach(() => system.restore());

  it('is the alternate surface in the dark scheme, not the card it sits on', () => {
    renderFormUnder('dark');

    expect(control('name')).toHaveStyle({ backgroundColor: carbonDark.surfaceAlt });
    expect(control('name')).not.toHaveStyle({ backgroundColor: carbonDark.surface });
  });

  it('fills a text area and a select the same way as a single-line field', () => {
    renderFormUnder('dark');

    expect(control('notes')).toHaveStyle({ backgroundColor: carbonDark.surfaceAlt });
    expect(control('unit')).toHaveStyle({ backgroundColor: carbonDark.surfaceAlt });
  });

  it('fills the filled, standard and bare variants too', () => {
    renderFormUnder('dark');

    expect(control('wood')).toHaveStyle({ backgroundColor: carbonDark.surfaceAlt });
    expect(control('weight')).toHaveStyle({ backgroundColor: carbonDark.surfaceAlt });
    expect(control('search')).toHaveStyle({ backgroundColor: carbonDark.surfaceAlt });
  });

  it('is the alternate surface in the light scheme as well, off both card and page', () => {
    renderFormUnder('light');

    expect(control('name')).toHaveStyle({ backgroundColor: carbonLight.surfaceAlt });
    expect(control('name')).not.toHaveStyle({ backgroundColor: carbonLight.surface });
    expect(control('name')).not.toHaveStyle({ backgroundColor: carbonLight.background });
  });

  it('fills every light-scheme variant off the page it may sit directly on', () => {
    renderFormUnder('light');

    ['notes', 'unit', 'wood', 'weight', 'search'].forEach(id => {
      expect(control(id)).toHaveStyle({ backgroundColor: carbonLight.surfaceAlt });
    });
  });
});
