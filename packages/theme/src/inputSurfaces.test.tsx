/**
 * A form control's fill and hairline, as a rendered field rather than as tokens.
 *
 * The design paints every input, textarea and select `background: inputBg` plus
 * `border: 1.5px solid inputBorder`, and derives the fill from the palette:
 * the alternate surface in the dark scheme, the page tone in the light one. It
 * is the hairline that makes a field a field — the design's history header puts
 * a page-toned field on a page-toned header and reads it by the border alone —
 * so both halves are asserted here, and the fill is only ever required to stay
 * off the card a field sits on, which is the #517 defect.
 *
 * Every variant is covered, because the fill is registered on the input base
 * that all of them are built from rather than on the outlined one alone.
 *
 * These render through the provider the application root uses, so what is
 * asserted is what a field actually paints under a scheme, not the shape of a
 * style override.
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

/**
 * The element a control's hairline is drawn on. The outlined control draws it
 * in the fieldset it needs anyway for the notch a floating label cuts; every
 * other variant draws it on the input base itself.
 */
const hairline = (testId: string): HTMLElement => {
  const root = control(testId);
  return (root.querySelector('.MuiOutlinedInput-notchedOutline') as HTMLElement) ?? root;
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

  /**
   * The design's light field is the page tone, and is read against the card it
   * sits on by its hairline. What it must not be is the card colour, which is
   * what Material-UI's transparent control gave it.
   */
  it('is the page background in the light scheme, not the card it sits on', () => {
    renderFormUnder('light');

    expect(control('name')).toHaveStyle({ backgroundColor: carbonLight.background });
    expect(control('name')).not.toHaveStyle({ backgroundColor: carbonLight.surface });
  });

  it('fills every light-scheme variant with that same page tone', () => {
    renderFormUnder('light');

    ['notes', 'unit', 'wood', 'weight', 'search'].forEach(id => {
      expect(control(id)).toHaveStyle({ backgroundColor: carbonLight.background });
    });
  });
});

/**
 * The hairline is what separates a field from whatever is behind it, so it is
 * the affordance the light scheme rests on entirely: a page-toned field in the
 * history header or on the card-less pre-smoke form is legible only because of
 * this border.
 */
describe('the hairline around a form control', () => {
  let system: ReturnType<typeof stubSystemColorScheme>;

  beforeEach(() => {
    system = stubSystemColorScheme();
    localStorage.clear();
  });
  afterEach(() => system.restore());

  it('is the design’s input border in the light scheme, not the surface hairline', () => {
    renderFormUnder('light');

    expect(hairline('name')).toHaveStyle({
      borderColor: carbonLight.inputBorder,
      borderWidth: '1.5px',
      borderStyle: 'solid',
    });
    expect(hairline('name')).not.toHaveStyle({ borderColor: carbonLight.border });
  });

  it('is the design’s input border in the dark scheme too', () => {
    renderFormUnder('dark');

    expect(hairline('name')).toHaveStyle({
      borderColor: carbonDark.inputBorder,
      borderWidth: '1.5px',
    });
  });

  it('is drawn around every variant, whichever element carries it', () => {
    renderFormUnder('light');

    ['notes', 'unit', 'wood', 'weight', 'search'].forEach(id => {
      expect(hairline(id)).toHaveStyle({
        borderColor: carbonLight.inputBorder,
        borderWidth: '1.5px',
      });
    });
  });

  /**
   * One hairline per field: the outlined control's root must not draw a second
   * line just outside the fieldset that already carries it.
   */
  it('leaves the outlined control’s own root unbordered, so the fieldset is the only line', () => {
    renderFormUnder('light');

    expect(control('name')).not.toHaveStyle({ borderStyle: 'solid' });
    // The variants with no fieldset of their own are the ones that draw it.
    expect(control('search')).toHaveStyle({ borderStyle: 'solid' });
  });
});
