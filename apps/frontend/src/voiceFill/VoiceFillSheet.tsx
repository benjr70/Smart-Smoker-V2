import { Box, Button, CircularProgress, Drawer, TextField, Theme, Typography } from '@mui/material';
import React, { useEffect, useState } from 'react';
import type { ReviewRow } from './extractionContract';
import type { VoiceFillScreen } from './fieldDefinition';
import { SCREEN_FIELDS } from './fieldDefinition';
import type { VoiceFillState } from './session';
import { isFixable } from './session';
import { VOICE_FILL_MAX_WIDTH, fieldCount, voiceFillCaptionSx } from './VoiceFillControls';
import { MicIcon } from '../components/common/components/DesignIcons';

/** How many of a screen's fields the hint line names. */
const HINTED_FIELDS = 5;

/** An action at the sheet's foot, at the size the state it is up in gives it. */
const actionSx = (height: number, fontSize: string) =>
  ({
    height,
    borderRadius: '14px',
    fontSize,
    fontWeight: 700,
    textTransform: 'none',
  }) as const;

/** The quieter action beside the main one: outlined, in the page's ink. */
const secondaryActionSx = (theme: Theme) =>
  ({
    ...actionSx(56, '1rem'),
    borderWidth: '1.5px',
    borderColor: theme.design.border,
    color: theme.design.text,
    '&:hover': { borderWidth: '1.5px', borderColor: theme.design.border },
  }) as const;

/** The main action at the sheet's foot: the one a state is up to be answered with. */
function PrimaryAction({
  testId,
  onClick,
  disabled,
  size = 'regular',
  children,
}: {
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  /** "Done talking" is the one a cook hits without looking: it is the larger. */
  size?: 'regular' | 'large';
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Button
      variant="contained"
      fullWidth
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      sx={size === 'large' ? actionSx(64, '1.0625rem') : actionSx(56, '1rem')}
    >
      {children}
    </Button>
  );
}

/**
 * The quieter action beside the main one. It shares the foot with it evenly,
 * unless it carries an icon: then it is only as wide as what it says.
 */
function SecondaryAction({
  testId,
  onClick,
  icon,
  children,
}: {
  testId: string;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Button
      variant="outlined"
      fullWidth={!icon}
      data-testid={testId}
      onClick={onClick}
      startIcon={icon}
      sx={theme => ({
        ...secondaryActionSx(theme),
        ...(icon ? { flexShrink: 0, padding: '0 18px' } : {}),
      })}
    >
      {children}
    </Button>
  );
}

/** The line under a state that has no rows to show: what happened, and what to do. */
function Explanation({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box
      sx={theme => ({
        fontSize: '0.875rem',
        lineHeight: 1.5,
        color: theme.design.textSecondary,
      })}
    >
      {children}
    </Box>
  );
}

/** A weight as a row writes it, or nothing for one nobody has entered. */
const weightText = (value: unknown): string => {
  const { weight, unit }: { weight?: unknown; unit?: unknown } =
    typeof value === 'object' && value !== null ? value : {};
  return weight === undefined || weight === null || weight === ''
    ? ''
    : `${weight} ${unit ?? ''}`.trim();
};

/**
 * A probe's target as a row writes it: the temperature it is cooked to, or
 * nothing for a probe nobody is watching — its row holds a number all the same,
 * but not one anybody is cooking to.
 */
const probeTargetText = (value: unknown): string => {
  const { target, enabled }: { target?: unknown; enabled?: unknown } =
    typeof value === 'object' && value !== null ? value : {};
  return enabled && typeof target === 'number' ? `${target}°F` : '';
};

/** A serve time as a row writes it: the day and the time on the clock. */
const serveAtText = (value: unknown): string =>
  value instanceof Date
    ? value.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : '';

/** A rest as a row writes it: `45 min`, `1 h`, `1 h 15 min`. */
const restText = (value: unknown): string => {
  if (typeof value !== 'number') {
    return '';
  }
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return [hours > 0 ? `${hours} h` : '', minutes > 0 || hours === 0 ? `${minutes} min` : '']
    .filter(Boolean)
    .join(' ');
};

/** The stamps a row logs, each by what its button says. */
const stampsText = (value: unknown): string =>
  (Array.isArray(value) ? value : [])
    .map((stamp: { label?: unknown }) => String(stamp?.label ?? ''))
    .filter(Boolean)
    .join(', ');

/**
 * How the screen values that are not plain text are written, by the field that
 * holds them. A value is written by what its field is, never by what it looks
 * like: an object is not a weight because it is an object.
 */
const WRITTEN_BY_FIELD: Readonly<Record<string, (value: unknown) => string>> = {
  weight: weightText,
  probe1Target: probeTargetText,
  probe2Target: probeTargetText,
  probe3Target: probeTargetText,
  serveAt: serveAtText,
  restMinutes: restText,
  stamps: stampsText,
};

/** A field's value as a Review row writes it; nothing for one that is empty. */
const valueText = (field: string, value: unknown): string => {
  if (value === undefined || value === null) {
    return '';
  }
  if (Object.prototype.hasOwnProperty.call(WRITTEN_BY_FIELD, field)) {
    return WRITTEN_BY_FIELD[field](value);
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  // A field holding an object nobody has said how to write is still shown as
  // what it holds: a row that proposes a change never reads as an empty one.
  return (typeof value === 'object' ? JSON.stringify(value) : String(value)).trim();
};

/** The moving bars that say the microphone is live. */
function LevelBars(): JSX.Element {
  return (
    <Box
      aria-hidden="true"
      data-testid="voice-fill-level-bars"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        height: 40,
        '@keyframes voice-fill-bar': {
          from: { transform: 'scaleY(0.15)' },
          to: { transform: 'scaleY(1)' },
        },
      }}
    >
      {Array.from({ length: 13 }, (_, bar) => (
        <Box
          key={bar}
          sx={theme => ({
            width: 5,
            height: '100%',
            borderRadius: '3px',
            backgroundColor: theme.design.accent,
            // Each bar keeps a beat of its own, so the row moves like a level
            // meter rather than like one thing blinking.
            animation: `voice-fill-bar ${0.7 + ((bar * 37) % 5) / 10}s ease-in-out ${
              (bar % 4) * 0.09
            }s infinite alternate`,
          })}
        />
      ))}
    </Box>
  );
}

/** The Ramble as it was heard, quoted. */
function QuotedTranscript({ transcript }: { transcript: string }): JSX.Element {
  return (
    <Box
      data-testid="voice-fill-transcript"
      sx={theme => ({
        fontSize: '0.875rem',
        lineHeight: 1.55,
        borderRadius: '12px',
        padding: '12px 14px',
        color: theme.design.textSecondary,
        backgroundColor: theme.design.surfaceAlt,
      })}
    >
      “{transcript || '…'}”
    </Box>
  );
}

interface FixableTranscriptProps {
  transcript: string;
  /** The text being typed, or nothing while the transcript is only being shown. */
  draft: string | null;
  onDraft: (text: string) => void;
  /** Has the text read in place of the transcript that was heard. */
  onFixText: (text: string) => void;
}

/**
 * The Ramble as it was heard, and the way to put a misheard word right without
 * saying it all again: "Fix the text" opens the transcript for typing into,
 * "Re-read text" has what was typed read. The text being typed is the sheet's
 * to hold, so the actions at its foot know of it.
 */
function FixableTranscript({
  transcript,
  draft,
  onDraft,
  onFixText,
}: FixableTranscriptProps): JSX.Element {
  const editing = draft !== null;
  return (
    <Box sx={{ marginBottom: '14px' }}>
      {editing ? (
        <TextField
          multiline
          fullWidth
          autoFocus
          rows={4}
          value={draft}
          onChange={event => onDraft(event.target.value)}
          inputProps={{ 'aria-label': 'Transcript', 'data-testid': 'voice-fill-transcript-editor' }}
        />
      ) : (
        <QuotedTranscript transcript={transcript} />
      )}
      <Button
        data-testid={editing ? 'voice-fill-reread' : 'voice-fill-fix-text'}
        onClick={() => (editing ? onFixText(draft) : onDraft(transcript))}
        sx={theme => ({
          ...actionSx(40, '0.8125rem'),
          borderRadius: '10px',
          marginTop: '8px',
          padding: '0 14px',
          backgroundColor: theme.design.accentTint,
          '&:hover': { backgroundColor: theme.design.accentTint },
        })}
      >
        {editing ? 'Re-read text' : 'Fix the text'}
      </Button>
    </Box>
  );
}

interface ReviewRowItemProps<Values> {
  row: ReviewRow<Values>;
  ticked: boolean;
  first: boolean;
  onToggle: () => void;
}

/**
 * One Review row: a tick, the field, the value it would be given and — where
 * it holds one — the value it holds now, struck through. The whole row is the
 * control, so there is no small box to hit.
 */
function ReviewRowItem<Values>({
  row,
  ticked,
  first,
  onToggle,
}: ReviewRowItemProps<Values>): JSX.Element {
  // A step list is added to, never replaced: its row shows the steps this
  // Ramble adds and strikes nothing through.
  const oldText = row.added ? '' : valueText(row.field, row.oldValue);
  return (
    <Box
      component="button"
      type="button"
      role="checkbox"
      aria-checked={ticked}
      data-testid={`voice-fill-row-${row.id}`}
      onClick={onToggle}
      sx={theme => ({
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
        textAlign: 'left',
        width: '100%',
        padding: '12px 0',
        background: 'none',
        border: 'none',
        borderTop: first ? 'none' : `1px solid ${theme.design.border}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
        color: theme.design.text,
        opacity: ticked ? 1 : 0.5,
      })}
    >
      <Box
        aria-hidden="true"
        sx={theme => ({
          flexShrink: 0,
          width: 26,
          height: 26,
          marginTop: '1px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ticked ? theme.design.accent : 'transparent',
          border: ticked ? 'none' : `1.8px solid ${theme.design.inputBorder}`,
          color: theme.palette.primary.contrastText,
        })}
      >
        {ticked && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={voiceFillCaptionSx}>{row.label}</Box>
        {row.added ? (
          <Box
            component="ol"
            sx={{
              margin: '4px 0 0',
              paddingLeft: '18px',
              fontSize: '0.9375rem',
              fontWeight: 600,
              lineHeight: 1.5,
            }}
          >
            {row.added.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </Box>
        ) : (
          <Box sx={{ fontSize: '1rem', fontWeight: 700, marginTop: '2px', whiteSpace: 'pre-wrap' }}>
            {valueText(row.field, row.newValue)}
          </Box>
        )}
        {oldText && (
          <Box
            sx={theme => ({
              fontSize: '0.75rem',
              marginTop: '3px',
              textDecoration: 'line-through',
              whiteSpace: 'pre-wrap',
              color: theme.design.textSecondary,
            })}
          >
            {oldText}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** What the sheet shows that is the state's own: its heading, body and actions. */
interface SheetParts {
  title: string;
  body?: React.ReactNode;
  footer?: React.ReactNode;
}

export interface VoiceFillSheetProps<Values> {
  screen: VoiceFillScreen;
  state: VoiceFillState<Values>;
  onDoneTalking: () => void;
  onToggle: (rowId: string) => void;
  onFill: () => void;
  /** Reads the transcript a problem kept again. */
  onRetry: () => void;
  /** Reads the transcript as the cook has corrected it. */
  onFixText: (transcript: string) => void;
  /** Records the Ramble again from the start. */
  onRedo: () => void;
  /**
   * Leaves the sheet for the place the models are picked. Where the screen has
   * no way there, none is given and "Change model" is not offered.
   */
  onChangeModel?: () => void;
  onClose: () => void;
}

/**
 * The Voice Fill sheet: what the cook watches from the tap that starts a
 * Ramble to the tap that fills from it. Until the microphone is open it says
 * it is getting ready, and not that it listens. Listening, it shows their words
 * arriving; working, the transcript and a spinner; in review, the rows the
 * Ramble proposes. And where a Ramble goes wrong, what went wrong and a way
 * on: nothing to fill, a problem with the model, a microphone that is blocked.
 *
 * It draws the session's state and reports taps; it decides nothing but which
 * text a tap is about: while the cook has typed a correction that has not been
 * read, it is the correction that Retry reads, and the rows of the uncorrected
 * text are not there to be filled from. A Drawer
 * underneath, as the confirmation sheet is, for the focus trap, the inert page
 * behind and Escape.
 */
export function VoiceFillSheet<Values>({
  screen,
  state,
  onDoneTalking,
  onToggle,
  onFill,
  onRetry,
  onFixText,
  onRedo,
  onChangeModel,
  onClose,
}: VoiceFillSheetProps<Values>): JSX.Element {
  const { title, fields } = SCREEN_FIELDS[screen];
  // Up from the tap that starts a Ramble until it is filled from or closed.
  const open = state.phase !== 'idle' && state.phase !== 'applied';
  const hinted = fields
    .slice(0, HINTED_FIELDS)
    .map(field => field.label.toLowerCase())
    .join(', ');

  // The correction being typed over the transcript, while one is.
  const fixable = isFixable(state);
  const [typed, setTyped] = useState<string | null>(null);
  // A correction belongs to the transcript it was typed over: it goes when
  // that transcript is read again, recorded again or closed.
  useEffect(() => {
    if (!fixable) {
      setTyped(null);
    }
  }, [fixable]);
  const draft = fixable ? typed : null;
  /** The correction, where there is one the model has not read. */
  const unread = fixable && draft !== null && draft !== state.transcript ? draft : null;

  // Everything that differs from one state to the next, said once per state.
  const parts = ((): SheetParts => {
    switch (state.phase) {
      case 'listening':
        if (state.gettingReady) {
          // The microphone is not open yet: to say "Listening" here would have
          // the cook speak words that nothing hears.
          return {
            title: 'Getting ready…',
            body: (
              <Box
                aria-live="polite"
                data-testid="voice-fill-getting-ready"
                sx={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: 120 }}
              >
                <CircularProgress size={20} thickness={5} aria-label="Getting ready to listen" />
                <Box
                  component="span"
                  sx={theme => ({ fontSize: '0.875rem', color: theme.design.textSecondary })}
                >
                  Hold on — start talking when this says Listening.
                </Box>
              </Box>
            ),
            footer: (
              <PrimaryAction
                testId="voice-fill-done-talking"
                onClick={onDoneTalking}
                size="large"
                // There is nothing said to be done with until the cook is heard.
                disabled
              >
                Done talking
              </PrimaryAction>
            ),
          };
        }
        return {
          title: 'Listening…',
          body: (
            <>
              <Box
                sx={theme => ({
                  fontSize: '0.8125rem',
                  lineHeight: 1.5,
                  marginBottom: '12px',
                  color: theme.design.textSecondary,
                })}
              >
                Talk through it naturally — {hinted}.
              </Box>
              <Box
                aria-live="polite"
                data-testid="voice-fill-live-transcript"
                sx={theme => ({
                  minHeight: 120,
                  fontSize: '1.1875rem',
                  lineHeight: 1.5,
                  fontWeight: 500,
                  color: state.transcript ? theme.design.text : theme.design.textSecondary,
                })}
              >
                {state.transcript || 'Start talking…'}
              </Box>
              <LevelBars />
            </>
          ),
          footer: (
            <PrimaryAction testId="voice-fill-done-talking" onClick={onDoneTalking} size="large">
              Done talking
            </PrimaryAction>
          ),
        };
      case 'working':
        return {
          title: 'Filling in fields…',
          body: (
            <>
              <QuotedTranscript transcript={state.transcript} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '22px 2px' }}>
                <CircularProgress size={20} thickness={5} aria-label="Reading the Ramble" />
                <Box
                  component="span"
                  sx={theme => ({ fontSize: '0.875rem', color: theme.design.textSecondary })}
                >
                  Reading it…
                </Box>
              </Box>
            </>
          ),
        };
      case 'review':
        return {
          title: `Found ${fieldCount(state.rows.length)}`,
          body: (
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {state.rows.map((row, index) => (
                <ReviewRowItem
                  key={row.id}
                  row={row}
                  first={index === 0}
                  ticked={state.ticked.includes(row.id)}
                  onToggle={() => onToggle(row.id)}
                />
              ))}
            </Box>
          ),
          footer: (
            <>
              <SecondaryAction
                testId="voice-fill-redo"
                onClick={onRedo}
                icon={<MicIcon size={18} />}
              >
                Redo
              </SecondaryAction>
              <PrimaryAction
                testId="voice-fill-fill"
                onClick={onFill}
                // The rows are of the text as it was read: once it has been
                // corrected they are not what the cook means until it is re-read.
                disabled={state.ticked.length === 0 || unread !== null}
              >
                Fill {fieldCount(state.ticked.length)}
              </PrimaryAction>
            </>
          ),
        };
      case 'nothing-to-fill':
        return {
          title: 'Nothing to fill',
          body: (
            <Explanation>
              Didn’t catch anything that matches this screen’s fields. Try naming things directly —{' '}
              {hinted}.
            </Explanation>
          ),
          footer: (
            <>
              <SecondaryAction testId="voice-fill-cancel" onClick={onClose}>
                Cancel
              </SecondaryAction>
              <PrimaryAction testId="voice-fill-try-again" onClick={onRedo}>
                Try again
              </PrimaryAction>
            </>
          ),
        };
      case 'problem':
        return {
          title: 'Voice fill hit a problem',
          body: (
            <Explanation>
              {state.transcript ? 'Your transcript is kept.' : 'Nothing was heard.'}{' '}
              {onChangeModel
                ? 'Retry, or pick another model in Settings.'
                : 'Tap Retry to try again.'}
            </Explanation>
          ),
          footer: (
            <>
              {onChangeModel && (
                <SecondaryAction testId="voice-fill-change-model" onClick={onChangeModel}>
                  Change model
                </SecondaryAction>
              )}
              <PrimaryAction
                testId="voice-fill-retry"
                // A correction not yet read is what a retry is of.
                onClick={() => (unread === null ? onRetry() : onFixText(unread))}
              >
                Retry
              </PrimaryAction>
            </>
          ),
        };
      case 'microphone-blocked':
        return {
          title: 'Microphone blocked',
          body: (
            <Explanation>
              Allow the microphone for this site in Chrome’s site settings, then tap Voice fill
              again.
            </Explanation>
          ),
          footer: (
            <PrimaryAction testId="voice-fill-blocked-close" onClick={onClose}>
              Close
            </PrimaryAction>
          ),
        };
      default:
        // Idle, or applied: the sheet is down.
        return { title: '' };
    }
  })();

  return (
    <Drawer
      anchor="bottom"
      open={open}
      // A stray touch outside the sheet must not throw away a Ramble that is
      // still being spoken; once it is over, outside is a way out like Close.
      onClose={(_event, reason) => {
        if (reason === 'backdropClick' && state.phase === 'listening') {
          return;
        }
        onClose();
      }}
      PaperProps={{
        role: 'dialog',
        'aria-modal': true,
        'aria-label': `Voice fill ${title}`,
        'data-testid': 'voice-fill-sheet',
        sx: theme => ({
          backgroundColor: theme.design.surface,
          backgroundImage: 'none',
          borderRadius: '22px 22px 0 0',
          padding: '12px 20px calc(18px + env(safe-area-inset-bottom))',
          maxWidth: VOICE_FILL_MAX_WIDTH,
          maxHeight: '88dvh',
          marginX: 'auto',
        }),
      }}
    >
      <Box
        aria-hidden="true"
        sx={theme => ({
          width: 38,
          height: 4,
          borderRadius: 2,
          margin: '0 auto 14px',
          flexShrink: 0,
          backgroundColor: theme.design.border,
        })}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box>
          <Box sx={voiceFillCaptionSx}>Voice fill · {title}</Box>
          <Typography
            component="h2"
            data-testid="voice-fill-title"
            sx={theme => ({
              fontSize: '1.25rem',
              fontWeight: 800,
              marginTop: '2px',
              color: theme.design.text,
            })}
          >
            {parts.title}
          </Typography>
        </Box>
        <Box
          component="button"
          type="button"
          aria-label="Close"
          data-testid="voice-fill-close"
          onClick={onClose}
          sx={theme => ({
            flexShrink: 0,
            width: 44,
            height: 44,
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: 20,
            lineHeight: 1,
            backgroundColor: theme.design.surfaceAlt,
            color: theme.design.textSecondary,
          })}
        >
          <span aria-hidden="true">×</span>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', padding: '14px 0 4px' }}>
        {fixable && (
          <FixableTranscript
            transcript={state.transcript}
            draft={draft}
            onDraft={setTyped}
            onFixText={onFixText}
          />
        )}
        {parts.body}
      </Box>

      <Box sx={{ display: 'flex', gap: '10px', paddingTop: '12px' }}>{parts.footer}</Box>
    </Drawer>
  );
}
