import { Card, CardContent, ScopedCssBaseline, Stack, Typography } from '@mui/material';
import React from 'react';
import { NotificationsCard } from './notifications';

declare const VERSION: string;

/**
 * The build version webpack's DefinePlugin substitutes in. Nothing defines it
 * outside a bundle (tests, a stray script), where the bare reference throws, so
 * the page falls back rather than failing to render.
 */
const readVersion = (): string => {
  try {
    return VERSION;
  } catch (error) {
    return 'unknown';
  }
};

export const Settings = (): JSX.Element => (
  // Scoped rather than a global CssBaseline: the other screens still lay
  // themselves out with content-box widths, and a document-wide box-sizing reset
  // would move them. Settings is the only screen restyled here.
  <ScopedCssBaseline
    data-testid="settings-page"
    sx={{
      backgroundColor: 'background.default',
      minHeight: 'calc(100vh - 56px)',
      paddingX: 2,
      paddingY: 3,
    }}
  >
    <Stack spacing={2} sx={{ width: '100%', maxWidth: 640, marginX: 'auto' }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 700, paddingX: 0.5 }}>
        Settings
      </Typography>
      <NotificationsCard />
      <VersionCard version={readVersion()} />
    </Stack>
  </ScopedCssBaseline>
);

/** The mock's label/value row: muted label on the left, value on the right. */
const VersionCard = ({ version }: { version: string }): JSX.Element => (
  <Card data-testid="settings-version-card">
    <CardContent>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="body2" color="text.secondary">
          Version
        </Typography>
        <Typography variant="body2" fontWeight={600} data-testid="settings-version-value">
          {version}
        </Typography>
      </Stack>
    </CardContent>
  </Card>
);
