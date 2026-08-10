import { Box, Typography } from '@mui/material';
import React from 'react';

/** The channels a row can be, which is what decides the colour it is drawn in. */
export type TemperatureChannel = 'chamber' | 'probe1' | 'probe2' | 'probe3';

export interface TemperatureRowProps {
  /** Which reading this row is — its colour and its test ids both come from it. */
  channel: TemperatureChannel;
  /** What the reading has been named, which the operator can rewrite in place. */
  name: string;
  /** Called with the new name as it is typed. */
  onNameChange: (name: string) => void;
  /** The name used when nothing has been typed yet. */
  placeholder: string;
  /** The temperature, as the session reports it. */
  value: string;
}

/**
 * One temperature reading, as the design draws it: a dot, the name it was
 * given, and what it is reading right now.
 *
 * The dot and the name share the probe's colour, and the chart draws that
 * probe's line in the matching one — that pairing is the whole navigation
 * between the rows and the graph below them, so it is set from one token here
 * rather than being chosen twice.
 *
 * The name is an input rather than a label with an edit control beside it: the
 * design shows a name, and renaming a probe mid-cook ("Probe 1" becomes
 * "Brisket Flat") should cost a tap on the word itself. It carries no underline
 * until it is focused, so a row at rest reads as the design's text and still
 * admits it can be typed into when it is.
 */
export function TemperatureRow({
  channel,
  name,
  onNameChange,
  placeholder,
  value,
}: TemperatureRowProps): JSX.Element {
  return (
    <Box
      data-testid={`smoke-${channel}-row`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        padding: '10px 14px',
      }}
    >
      {/* Decoration in the strict sense — the name beside it says everything it
          says — so it is not announced. */}
      <Box
        data-testid={`smoke-${channel}-dot`}
        aria-hidden="true"
        sx={theme => ({
          width: 10,
          height: 10,
          borderRadius: '50%',
          flexShrink: 0,
          backgroundColor: theme.design.probes[channel],
        })}
      />
      {/* A bare input rather than a Material-UI field. The design's name is
          text that happens to be typeable, and every one of a field's
          furnishings — the underline, the label, the notch, the padding that
          holds them — would have had to be turned off again. This is the same
          call the segmented control made for its segments. */}
      <Box
        component="input"
        type="text"
        value={name}
        placeholder={placeholder}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onNameChange(event.target.value)}
        data-testid={`smoke-${channel}-name-input`}
        aria-label={`${placeholder} name`}
        sx={theme => ({
          flex: 1,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          padding: 0,
          background: 'transparent',
          font: 'inherit',
          // Large and bold, which is the only size the probe colours are
          // readable at: two of the light ones are chart colours first and do
          // not clear the ordinary contrast threshold on a white card. The
          // palette's contrast suite holds them to the large-text threshold on
          // exactly that understanding.
          fontSize: 20,
          fontWeight: 700,
          color: theme.design.probes[channel],
          // Focus is shown by the row rather than by an outline drawn around
          // the text, which on a name this short reads as a box round a word.
          '&:focus': { borderBottom: `1px solid ${theme.design.probes[channel]}` },
        })}
      />
      <Typography
        component="div"
        data-testid={`smoke-${channel}-temp`}
        sx={theme => ({
          flexShrink: 0,
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1.1,
          // Numbers that do not shuffle sideways as they change: a reading
          // climbing from 99 to 100 should not move the three rows under it.
          fontVariantNumeric: 'tabular-nums',
          color: theme.design.probes[channel],
        })}
      >
        {value}
        {/* The unit is part of the reading, not a column heading, so a row read
            on its own still says what it is. It is set small, because it is the
            one part of the number that never changes — and therefore in
            supporting ink rather than the probe's colour, which is only legible
            large. */}
        <Box
          component="span"
          sx={theme => ({
            fontSize: 14,
            fontWeight: 600,
            marginLeft: '1px',
            color: theme.design.textSecondary,
          })}
        >
          °F
        </Box>
      </Typography>
    </Box>
  );
}
