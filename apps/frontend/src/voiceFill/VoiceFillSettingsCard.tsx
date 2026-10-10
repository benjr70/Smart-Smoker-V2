import {
  Box,
  Button,
  Card,
  CardContent,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import React, { useEffect, useRef } from 'react';
import type { ModelStatus } from './modelLibrary';
import { isArriving, isDownloaded, percentOf, pickedModel, statusOf } from './modelLibrary';
import { useSupportedModelLibrary } from './ModelLibraryProvider';
import type { ModelRole, VoiceFillModel } from './modelRegistry';
import { MODEL_ROLES, formatBytes } from './modelRegistry';

/** What each dropdown is called. */
const ROLE_LABELS: Record<ModelRole, string> = {
  speech: 'Speech-to-text model',
  extractor: 'Field extraction model',
};

interface ModelStatusLineProps {
  role: ModelRole;
  model: VoiceFillModel;
  status: ModelStatus;
  onDownload: () => void;
  onCancel: () => void;
  onRemove: () => void;
}

/**
 * Where the picked model stands on this phone, and the one thing that can be
 * done about it: download it, cancel the download, or remove it.
 */
function ModelStatusLine({
  role,
  model,
  status,
  onDownload,
  onCancel,
  onRemove,
}: ModelStatusLineProps): JSX.Element {
  const size = formatBytes(model.sizeBytes);
  const arriving = isArriving(status);
  const percent = arriving ? percentOf(status.receivedBytes, model.sizeBytes) : 0;

  let text: string;
  let action: { label: string; onClick: () => void; quiet: boolean };
  switch (status.state) {
    case 'downloading':
      text = `Downloading ${percent}% · ${formatBytes(status.receivedBytes)} of ${size}`;
      action = { label: 'Cancel', onClick: onCancel, quiet: true };
      break;
    case 'paused':
      text = `Paused, waiting for Wi-Fi · ${formatBytes(status.receivedBytes)} of ${size}`;
      action = { label: 'Cancel', onClick: onCancel, quiet: true };
      break;
    case 'ready':
      text = `Ready to use · ${size} on phone`;
      action = { label: 'Remove', onClick: onRemove, quiet: true };
      break;
    case 'failed':
      text = 'Didn’t work on this phone';
      action = { label: 'Remove', onClick: onRemove, quiet: true };
      break;
    default:
      text = `Not downloaded · ${size}`;
      action = { label: 'Download', onClick: onDownload, quiet: false };
  }

  return (
    <Box data-testid={`voice-fill-model-status-${role}`}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 36 }}>
        <Typography
          variant="body2"
          // Announced, politely, as it changes: a download is not watched.
          role="status"
          sx={theme => ({
            flex: 1,
            fontWeight: status.state === 'ready' || status.state === 'downloading' ? 600 : 400,
            fontVariantNumeric: 'tabular-nums',
            color:
              status.state === 'failed'
                ? theme.design.danger
                : status.state === 'ready' || status.state === 'downloading'
                  ? theme.design.text
                  : theme.design.textSecondary,
          })}
        >
          {text}
        </Typography>
        <Button
          size="small"
          onClick={action.onClick}
          // The card can have two of each of these: each says which model it is for.
          aria-label={`${action.label} ${model.name}`}
          sx={theme => ({
            flexShrink: 0,
            fontWeight: 700,
            textTransform: 'none',
            color: action.quiet ? theme.design.textSecondary : theme.design.accent,
          })}
        >
          {action.label}
        </Button>
      </Stack>
      {arriving && (
        <LinearProgress
          variant="determinate"
          value={percent}
          aria-label={`${model.name} download`}
          sx={{ height: 6, borderRadius: 3 }}
        />
      )}
    </Box>
  );
}

/**
 * The Voice Fill card of the settings screen: which speech model and which
 * extraction model this phone uses, and where each stands on it.
 *
 * Two dropdowns and a status line under each — nothing else; there is no
 * switch for Voice Fill and none for the review. What it shows and changes is
 * the phone's Model library, never the application settings the backend
 * shares between devices.
 *
 * A role with no model registered has no dropdown: while there is a speech
 * model and no extraction model, the card is the speech dropdown alone.
 *
 * It is absent on a phone that cannot run Voice Fill, and where there is no
 * model of either role to pick.
 */
export function VoiceFillSettingsCard(): JSX.Element | null {
  const models = useSupportedModelLibrary();
  const card = useRef<HTMLDivElement>(null);
  const shown = models !== null;
  const consumeCardRequest = models?.consumeCardRequest;

  // The grey pill opens the settings screen for this card: bring it into view.
  useEffect(() => {
    if (shown && consumeCardRequest?.()) {
      card.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [shown, consumeCardRequest]);

  if (!models) {
    return null;
  }
  const { library, state } = models;
  const { registry } = library;
  // Which model each dropdown shows is the library's to say: the card has no
  // pick of its own. A role with no model to pick has no dropdown, and with no
  // dropdown at all there is no card.
  const dropdowns: { role: ModelRole; model: VoiceFillModel }[] = [];
  MODEL_ROLES.forEach(role => {
    const model = pickedModel(registry, state, role);
    if (model) {
      dropdowns.push({ role, model });
    }
  });
  if (dropdowns.length === 0) {
    return null;
  }

  return (
    <Card ref={card} data-testid="settings-voice-fill-card">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2" fontWeight={700}>
            Voice fill
          </Typography>
          {dropdowns.map(({ role, model }) => {
            const listed = registry.ofRole(role);
            return (
              <Box key={role} data-testid={`voice-fill-model-${role}`}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label={ROLE_LABELS[role]}
                  value={model.id}
                  onChange={event => library.pick(role, event.target.value)}
                >
                  {listed.map(option => (
                    <MenuItem key={option.id} value={option.id}>
                      {option.name}
                      {/* Ticked for being on the phone, whether or not it runs
                          here: the list shows what is taking the storage. */}
                      {isDownloaded(statusOf(state, option)) && (
                        <Box component="span" role="img" aria-label="downloaded" sx={{ ml: 1 }}>
                          ✓
                        </Box>
                      )}
                    </MenuItem>
                  ))}
                </TextField>
                <ModelStatusLine
                  role={role}
                  model={model}
                  status={statusOf(state, model)}
                  onDownload={() => library.download(model.id)}
                  onCancel={() => library.cancel(model.id)}
                  onRemove={() => library.remove(model.id)}
                />
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}
