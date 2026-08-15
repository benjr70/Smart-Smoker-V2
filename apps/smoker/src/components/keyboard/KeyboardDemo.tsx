/**
 * A minimal harness proving the keyboard wrapper's contract does real work:
 * every character lands in a field, backspace erases, and the layer switches
 * are visible. This is the wiring pattern the wifi screen adopts in slice 10;
 * until then the harness exists for the contract demo and its test.
 */
import { Stack, TextField } from '@mui/material';
import React, { useState } from 'react';
import { VirtualKeyboard } from './VirtualKeyboard';

export function KeyboardDemo(): JSX.Element {
  const [value, setValue] = useState('');

  return (
    <Stack spacing={2}>
      <TextField label="Typed text" value={value} inputProps={{ readOnly: true }} fullWidth />
      <VirtualKeyboard
        onCharacter={character => setValue(current => current + character)}
        onBackspace={() => setValue(current => current.slice(0, -1))}
      />
    </Stack>
  );
}
