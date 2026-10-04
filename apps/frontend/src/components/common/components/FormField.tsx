import { Box, SxProps, Theme } from '@mui/material';
import React from 'react';

/**
 * How the design writes the small print that names things: upper case, spaced
 * out, in supporting ink. One declaration, because a label and a section heading
 * differing by a hair is the sort of thing nobody sees and everybody feels.
 */
const caption = (theme: Theme) =>
  ({
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    lineHeight: 1.3,
    textTransform: 'uppercase',
    color: theme.design.textSecondary,
  }) as const;

export interface FormFieldProps {
  /**
   * What the field is called, in ordinary words. It is *drawn* in upper case;
   * it is not written that way, because the label is also what a screen reader
   * announces and "MEAT TYPE" is announced letter by letter by some of them.
   */
  label: string;
  /**
   * The `id` of the control this labels, for controls that are real form
   * elements — an input, a textarea. Either this or {@link labelId} has to be
   * given: a label naming nothing is decoration.
   */
  htmlFor?: string;
  /**
   * The `id` put on the label itself, for controls that name themselves by
   * pointing at their label instead of being pointed at — Material-UI's select
   * (`labelId`) is the one on these forms.
   */
  labelId?: string;
  /** Extra layout for the field as a whole, e.g. how it shares a row. */
  sx?: SxProps<Theme>;
  /** The control the label belongs to. */
  children: React.ReactNode;
}

/**
 * One labelled field of the design's forms: a small upper-case label in
 * supporting ink, with its control under it.
 *
 * The design puts the label above the field rather than floating it in the
 * field's outline, which is what Material-UI's own label does. Turning that
 * behaviour off field by field means passing `label`, `shrink`, `notched` and a
 * legend width around every control on the screen; stating the label once, here,
 * is both shorter and the only way the pre- and post-smoke steps end up drawing
 * their labels identically.
 *
 * It is a wrapper rather than a replacement for the controls: what sits inside
 * is an ordinary Material-UI field, so nothing about validation, masking or the
 * free-text pickers changes.
 */
export function FormField({ label, htmlFor, labelId, sx, children }: FormFieldProps): JSX.Element {
  return (
    <Box
      sx={[
        { display: 'flex', flexDirection: 'column', gap: '6px' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box component="label" id={labelId} htmlFor={htmlFor} sx={caption}>
        {label}
      </Box>
      {children}
    </Box>
  );
}

export interface SectionHeadingProps {
  /** What the section is called, in ordinary words; drawn in upper case. */
  children: React.ReactNode;
}

/**
 * The heading of a card's section, in the same small print the field labels are
 * set in — the treatment the smoke step's "TEMPERATURE HISTORY" already uses.
 *
 * It is a real heading rather than styled text so that the steps' cards can be
 * navigated by heading, which is how a screen reader user skims a long form.
 * The gap under it belongs to the card that stacks it, so it carries no margin
 * of its own.
 */
export function SectionHeading({ children }: SectionHeadingProps): JSX.Element {
  return (
    <Box component="h2" sx={theme => ({ ...caption(theme), margin: 0 })}>
      {children}
    </Box>
  );
}
