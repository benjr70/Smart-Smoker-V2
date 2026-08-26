import {
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import React, { useState } from 'react';
import {
  CookStamp,
  DEFAULT_STAMPS,
  MAX_STAMPS,
  MAX_STAMP_LABEL,
  STAMP_TONES,
  StampTone,
  isDefaultCatalogue,
  newCustomStamp,
  useStampCatalogue,
} from '../../api';
import { StampCatalogueSubscriptionPort } from '../../api/useStampCatalogue';
import { toneColor } from '../common/stampTones';

export interface StampEditorCardProps {
  /** How this card hears about a catalogue another client saved. */
  subscription?: StampCatalogueSubscriptionPort;
}

/** The letter a stamp's marker carries on the chart: the label's first. */
const markerLetter = (label: string): string => (label.trim()[0] ?? '?').toUpperCase();

/**
 * The Cook log stamps card: what the buttons at the smoker say, what colour
 * they are, what order they come in, and which of them are offered at all.
 *
 * Edited here and nowhere else. The catalogue is installation-wide — the phone
 * and the touchscreen draw their buttons from it and every logged event is
 * keyed to it — so each change saves the whole list at once and every open
 * screen is told over the websocket. There is no Save button for the same
 * reason the rest of this page has none: a pitmaster who edited a label and
 * walked away must not find the old one at the smoker.
 *
 * A label is committed when the field is left rather than on every keystroke.
 * Half a word is not a name anybody chose, and the backend refuses an empty
 * one — a save per character would post several the catalogue's rules reject
 * and the last few would race each other.
 */
export function StampEditorCard({ subscription }: StampEditorCardProps = {}): JSX.Element {
  const { stamps, save } = useStampCatalogue({ subscription });
  /** The stamp whose row is open for editing, if any. One at a time. */
  const [editing, setEditing] = useState<string | null>(null);
  /**
   * The label being typed, held apart from the catalogue so the field shows
   * what the user is writing while what is *stored* is still the last name
   * they settled on.
   */
  const [draft, setDraft] = useState<string | null>(null);

  const apply = (next: CookStamp[]): void => {
    void save(next);
  };

  const replace = (key: string, change: Partial<CookStamp>): void =>
    apply(stamps.map(stamp => (stamp.key === key ? { ...stamp, ...change } : stamp)));

  const move = (index: number, by: number): void => {
    const next = [...stamps];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    apply(next);
  };

  const commitLabel = (stamp: CookStamp): void => {
    const label = (draft ?? '').trim().slice(0, MAX_STAMP_LABEL);
    setDraft(null);
    // An empty field is a label nobody chose: the row keeps the name it had
    // rather than being saved as something the backend would refuse anyway.
    if (label && label !== stamp.label) {
      replace(stamp.key, { label });
    }
  };

  return (
    <Card data-testid="settings-cook-log-stamps-card">
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" component="h2" fontWeight={700}>
              Cook log stamps
            </Typography>
            {/* Offered only when there is something to undo: restoring the
                shipped set for somebody already on it is a button that does
                nothing. */}
            {isDefaultCatalogue(stamps) ? null : (
              <Button
                size="small"
                onClick={() => apply(DEFAULT_STAMPS.map(stamp => ({ ...stamp })))}
              >
                Reset
              </Button>
            )}
          </Stack>

          <Stack
            divider={<Box sx={theme => ({ borderTop: `1px solid ${theme.design.border}` })} />}
          >
            {stamps.map((stamp, index) => (
              <Stack key={stamp.key} data-testid={`stamp-row-${stamp.key}`} sx={{ paddingY: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box
                    data-testid={`stamp-tone-${stamp.key}`}
                    sx={theme => ({
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      flexShrink: 0,
                      backgroundColor: toneColor(stamp.tone, theme.design),
                    })}
                  />
                  <Box
                    component="button"
                    type="button"
                    aria-label={`Edit ${stamp.label}`}
                    aria-expanded={editing === stamp.key}
                    onClick={() => {
                      setDraft(null);
                      setEditing(editing === stamp.key ? null : stamp.key);
                    }}
                    sx={{
                      flexGrow: 1,
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      font: 'inherit',
                    }}
                  >
                    <Typography data-testid="stamp-label" variant="body1" fontWeight={600}>
                      {stamp.label}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    aria-label={`Move ${stamp.label} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUpwardIcon fontSize="inherit" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={`Move ${stamp.label} down`}
                    disabled={index === stamps.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownwardIcon fontSize="inherit" />
                  </IconButton>
                  <Switch
                    size="small"
                    checked={stamp.enabled}
                    inputProps={{ 'aria-label': `Show ${stamp.label}` }}
                    onChange={event => replace(stamp.key, { enabled: event.target.checked })}
                  />
                </Stack>

                {editing === stamp.key ? (
                  <Stack spacing={1.5} sx={{ paddingTop: 1.5, paddingBottom: 0.5 }}>
                    <TextField
                      label="Label"
                      size="small"
                      value={draft ?? stamp.label}
                      inputProps={{ maxLength: MAX_STAMP_LABEL }}
                      onChange={event => setDraft(event.target.value)}
                      onBlur={() => commitLabel(stamp)}
                    />
                    <Stack direction="row" spacing={1}>
                      {STAMP_TONES.map((tone: StampTone) => (
                        <Box
                          key={tone}
                          component="button"
                          type="button"
                          aria-label={`Colour ${tone}`}
                          aria-pressed={stamp.tone === tone}
                          onClick={() => replace(stamp.key, { tone })}
                          sx={theme => ({
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            cursor: 'pointer',
                            backgroundColor: toneColor(tone, theme.design),
                            border:
                              stamp.tone === tone
                                ? `2px solid ${theme.design.text}`
                                : `1px solid ${theme.design.border}`,
                          })}
                        />
                      ))}
                    </Stack>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        {`Marker shows ${markerLetter(draft ?? stamp.label)} on the chart`}
                      </Typography>
                      {/* A default may be switched off but never removed: an
                          event keyed to a deleted one would read from its
                          snapshot forever, and the six are what a fresh
                          installation offers. */}
                      {stamp.custom ? (
                        <Button
                          size="small"
                          color="error"
                          onClick={() => {
                            setEditing(null);
                            apply(stamps.filter(candidate => candidate.key !== stamp.key));
                          }}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </Stack>
                  </Stack>
                ) : null}
              </Stack>
            ))}
          </Stack>

          {/* Withdrawn at the cap rather than offered and refused: the backend
              stores at most twelve, and a button that always fails is worse
              than one that is not there. */}
          {stamps.length < MAX_STAMPS ? (
            <Button
              size="small"
              onClick={() => apply([...stamps, newCustomStamp()])}
              sx={{ alignSelf: 'flex-start' }}
            >
              + Add stamp
            </Button>
          ) : null}

          <Typography variant="body2" color="text.secondary">
            The buttons on the live cook screen and on the smoker touchscreen. Renaming one renames
            it everywhere it has already been logged.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
