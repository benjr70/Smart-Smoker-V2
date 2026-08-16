/**
 * The fill behind a form control, as a rendered field rather than as a token.
 *
 * The design fills every input, textarea and select with `inputBg` — the page
 * background in the light scheme, the alternate surface in the dark one — so
 * that a field reads as a well cut into the card it sits on. Material-UI's own
 * outlined control is transparent, which in the dark scheme left every field
 * the colour of the card and all but invisible (#517).
 *
 * These render through the provider the application root uses, so what is
 * asserted is the colour a field actually paints in under a scheme, not the
 * shape of a style override.
 */
import {
  Card,
  Experimental_CssVarsProvider as CssVarsProvider,
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

/** A card of the design's form controls, painted by the scheme in effect. */
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
        </Card>
      </DesignSurface>
    </CssVarsProvider>
  );
};

/** The element a control's fill is painted on: the outlined input's root. */
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

  it('is the page background in the light scheme, not the card it sits on', () => {
    renderFormUnder('light');

    expect(control('name')).toHaveStyle({ backgroundColor: carbonLight.background });
    expect(control('name')).not.toHaveStyle({ backgroundColor: carbonLight.surface });
  });
});
