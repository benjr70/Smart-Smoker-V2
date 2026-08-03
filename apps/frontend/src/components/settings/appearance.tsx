import {
  Card,
  CardContent,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useColorScheme, useTheme } from '@mui/material/styles';
import React from 'react';
import { AppearanceMode, resolveAppearance } from '../../theme';
import { useAppearanceChoice } from '../../theme/SharedAppearance';

/** The three choices, in the order the mock lays them out. */
const OPTIONS: ReadonlyArray<{ mode: AppearanceMode; label: string }> = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'system', label: 'Auto' },
];

/**
 * The mock's Appearance card: a three-up segmented control with the chosen
 * option raised onto a surface.
 *
 * The choice is held by the colour-scheme provider, which persists it locally
 * and applies it to the document, so choosing here re-paints the app at once and
 * the choice is still in effect after a reload. It is also published, so that
 * every other client of this installation picks it up rather than each browser
 * keeping an opinion of its own.
 */
export function AppearanceCard(): JSX.Element {
  const { mode, systemMode, colorScheme } = useColorScheme();
  const choose = useAppearanceChoice();
  const { design } = useTheme();

  // What is rendered right now, decided by the one rule the whole product
  // shares rather than by a second copy of it living in this card.
  const { colorScheme: inEffect } = resolveAppearance({
    stored: mode && colorScheme ? { mode, resolvedMode: colorScheme } : null,
    systemDark: systemMode === 'dark',
  });
  const explanation =
    (mode ?? 'system') === 'system'
      ? `Following your device — currently ${inEffect}.`
      : `Always ${inEffect}, regardless of your device setting.`;

  return (
    // No spacing wrapper: the settings page stacks its cards and owns the gap
    // between them.
    <Card data-testid="settings-appearance-card">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="h6" component="h2" fontWeight={600}>
            Appearance
          </Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={mode ?? 'system'}
            onChange={(_event, chosen: AppearanceMode | null) => chosen && choose(chosen)}
            aria-label="Appearance"
            sx={{ backgroundColor: design.surfaceAlt, borderRadius: 2, padding: 0.5, gap: 0.5 }}
          >
            {OPTIONS.map(({ mode: value, label }) => (
              <ToggleButton
                key={value}
                value={value}
                // Doubled selectors: Material-UI tints a selected toggle with its
                // own overlay, and the option in effect has to sit on the card's
                // surface instead — that is what makes it read as raised.
                sx={{
                  '&&': {
                    border: 0,
                    borderRadius: 1.5,
                    paddingY: 1,
                    textTransform: 'none',
                    fontWeight: 600,
                    color: design.textSecondary,
                  },
                  '&&.Mui-selected': {
                    backgroundColor: design.surface,
                    color: design.text,
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.16)',
                  },
                }}
              >
                {label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Typography
            variant="body2"
            color="text.secondary"
            data-testid="settings-appearance-explanation"
          >
            {explanation}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
