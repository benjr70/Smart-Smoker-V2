/**
 * The cook picker: a sheet over the comparison, holding every cook ever logged.
 *
 * Two dropdowns would ask the pitmaster to already know which cook they wanted.
 * This one assumes the opposite — that the cook is remembered as "the pork one,
 * on cherry, some time in July" — so it searches those fragments, offers the
 * archive in three orders, and shows enough of each cook on its row to be
 * recognised without its name.
 *
 * It is a Material-UI `Drawer`, like the app's confirmation sheet, because
 * everything that makes a sheet safe is already in it: focus trapped inside and
 * returned on close, the comparison behind it inert and hidden from assistive
 * technology, and both Escape and the scrim as ways out. The sheet holds what is
 * typed and pressed; which cook ends up in which slot is the comparison's to
 * say.
 */
import { BackdropProps, Box, Drawer, IconButton, InputBase, Typography } from '@mui/material';
import React, { useState } from 'react';
import { SmokeHistory } from '../../../api/types';
import { FilterChip } from '../../common/components/FilterChip';
import { SearchIcon } from '../../common/components/DesignIcons';
import { NOT_RECORDED, formatCookDuration } from '../../common/timeFormat';
import { CookSort, selectPickerCooks } from './cookPickerQuery';

/** The sort pills, in the order they are offered; the first is the default. */
const SORTS: ReadonlyArray<{ sort: CookSort; label: string }> = [
  { sort: 'recent', label: 'Recent' },
  { sort: 'rated', label: 'Top rated' },
  { sort: 'name', label: 'A–Z' },
];

/** What the archive shows for a cook nobody named. */
const UNNAMED = 'Unnamed cook';

/** The score bar's scale. */
const MAX_SCORE = 10;

export interface CookPickerSheetProps {
  /** Whether the sheet is up. */
  open: boolean;
  /** Which slot is being filled — what the sheet is picking *for*. */
  side: 'A' | 'B';
  /** Every cook that can be picked, newest first. */
  cooks: readonly SmokeHistory[];
  /** The cook already in this slot, if any: the current choice. */
  selectedId?: string;
  /** The cook in the other slot, if any: shown, but not pickable. */
  otherId?: string;
  /** Called with the chosen cook's id. */
  onPick: (smokeId: string) => void;
  /** Called for every way out that is not picking: the ×, Escape, the scrim. */
  onClose: () => void;
}

/** A cook's overall taste, or `null` for one nobody scored. */
const scoreOf = (cook: SmokeHistory): number | null => {
  const rated = parseFloat(cook.overAllRating);
  return Number.isFinite(rated) && rated > 0 ? rated : null;
};

/** What a row says about the cook, after its name: the four recognising facts. */
const factsOf = (cook: SmokeHistory): string[] => [
  cook.date || NOT_RECORDED,
  [cook.weight, cook.weightUnit, cook.meatType].filter(part => part !== '').join(' ') ||
    NOT_RECORDED,
  cook.woodType || NOT_RECORDED,
  formatCookDuration(cook.durationMs),
];

interface CookRowProps {
  cook: SmokeHistory;
  /** Whether this cook is the one already in the slot being filled. */
  selected: boolean;
  /** Whether this cook is in the *other* slot, and so cannot be picked. */
  taken: boolean;
  onPick: (smokeId: string) => void;
}

/**
 * One cook, offered.
 *
 * The whole row is the control, at the design's 72px, because the sheet is
 * driven with one thumb; the cook in the other slot keeps its row — the
 * pitmaster should see where it went — but the row is inert, since a cook
 * cannot be compared against itself.
 */
function CookRow({ cook, selected, taken, onPick }: CookRowProps): JSX.Element {
  const name = cook.name || UNNAMED;
  const score = scoreOf(cook);

  // The row is recognised by its facts, not by its name — that is the whole
  // reason the facts are on it — so the accessible name carries them too.
  // Naming the button after the cook alone would hand a screen-reader user a
  // list of names to choose between, which is exactly the choice the sheet
  // exists to save them from.
  const spoken = [
    `Pick ${name}`,
    ...factsOf(cook),
    score === null ? 'not rated' : `overall taste ${score.toFixed(1)} out of 10`,
    ...(selected && !taken ? ['currently chosen'] : []),
    ...(taken ? ['already in the other slot'] : []),
  ].join(', ');

  return (
    <Box
      component="button"
      type="button"
      data-testid="cook-picker-row"
      data-smoke-id={cook.smokeId}
      disabled={taken}
      aria-label={spoken}
      onClick={() => onPick(cook.smokeId)}
      sx={theme => ({
        width: '100%',
        minHeight: 72,
        padding: '12px 14px',
        borderRadius: '13px',
        textAlign: 'left',
        font: 'inherit',
        cursor: taken ? 'default' : 'pointer',
        opacity: taken ? 0.45 : 1,
        backgroundColor: selected ? theme.design.surfaceAlt : 'transparent',
        border: `1.5px solid ${selected ? theme.design.accent : theme.design.border}`,
        transition: 'background-color 150ms ease, border-color 150ms ease',
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Box
          component="span"
          sx={theme => ({
            flex: 1,
            minWidth: 0,
            fontSize: '0.9375rem',
            fontWeight: 700,
            color: theme.design.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          })}
        >
          {name}
        </Box>
        {taken && (
          <Box
            component="span"
            sx={theme => ({
              flexShrink: 0,
              fontSize: '0.625rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: theme.design.textSecondary,
            })}
          >
            IN USE
          </Box>
        )}
        {selected && !taken && (
          <Box
            component="svg"
            data-testid="cook-picker-check"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            sx={theme => ({ width: 17, height: 17, flexShrink: 0, color: theme.design.accent })}
          >
            <path
              d="M5 12.5l4.5 4.5L19 7"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Box>
        )}
      </Box>

      {/* The four facts, dot-separated: enough to recognise a cook by. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          flexWrap: 'wrap',
          marginTop: '4px',
        }}
      >
        {factsOf(cook).map((fact, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <Box
                component="span"
                aria-hidden="true"
                sx={theme => ({
                  width: 3,
                  height: 3,
                  borderRadius: '50%',
                  backgroundColor: theme.design.textSecondary,
                  opacity: 0.5,
                })}
              />
            )}
            <Box
              component="span"
              sx={theme => ({
                fontSize: '0.75rem',
                fontWeight: index === 0 ? 600 : 400,
                color: theme.design.textSecondary,
              })}
            >
              {fact}
            </Box>
          </React.Fragment>
        ))}
      </Box>

      {/* How it tasted, as the one score a cook is compared on. A cook nobody
          rated shows an empty bar and an em-dash rather than a zero, which
          would be a verdict nobody gave. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '7px' }}>
        <Box
          aria-hidden="true"
          sx={theme => ({
            flex: 1,
            maxWidth: 130,
            height: 5,
            borderRadius: '3px',
            overflow: 'hidden',
            backgroundColor: theme.design.surfaceAlt,
          })}
        >
          <Box
            sx={theme => ({
              width: `${((score ?? 0) / MAX_SCORE) * 100}%`,
              height: '100%',
              backgroundColor: theme.design.accent,
            })}
          />
        </Box>
        <Box
          component="span"
          data-testid="cook-picker-score"
          sx={theme => ({
            fontSize: '0.75rem',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: theme.design.textSecondary,
          })}
        >
          {score === null ? NOT_RECORDED : score.toFixed(1)}
        </Box>
      </Box>
    </Box>
  );
}

export function CookPickerSheet({
  open,
  side,
  cooks,
  selectedId,
  otherId,
  onPick,
  onClose,
}: CookPickerSheetProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [meats, setMeats] = useState<string[]>([]);
  const [sort, setSort] = useState<CookSort>('recent');

  // What is searched, what a chip narrows, and what order the survivors come
  // back in are the query module's; the sheet holds only what was typed and
  // pressed. `chosen` comes back reconciled against the archive, so a chip whose
  // last cook has been deleted stops narrowing instead of emptying the list.
  const {
    shown,
    total,
    meatTypes,
    meats: chosen,
  } = selectPickerCooks(cooks, { query, meats, sort });

  const toggleMeat = (meat: string): void =>
    setMeats(chosen.includes(meat) ? chosen.filter(other => other !== meat) : [...chosen, meat]);

  // Picking is the only way out that says anything about the slot; the sheet
  // closes on it, because the pitmaster came here to answer one question.
  const pick = (smokeId: string): void => {
    onPick(smokeId);
    onClose();
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      // The scrim is a way out of the sheet, so it is addressable like the ×
      // is. Backdrop forwards unknown props to its root element, but its type
      // does not admit data attributes, hence the cast.
      ModalProps={{
        BackdropProps: { 'data-testid': 'cook-picker-backdrop' } as Partial<BackdropProps>,
      }}
      PaperProps={{
        role: 'dialog',
        'aria-modal': true,
        'aria-label': `Pick cook ${side}`,
        'data-testid': 'cook-picker',
        sx: theme => ({
          backgroundColor: theme.design.surface,
          backgroundImage: 'none',
          borderRadius: '20px 20px 0 0',
          maxWidth: 480,
          marginX: 'auto',
          // The sheet takes most of the screen and scrolls inside itself, so
          // the comparison underneath keeps its scroll position: choosing a
          // cook must not cost the pitmaster their place in the comparison.
          height: '86vh',
          display: 'flex',
          flexDirection: 'column',
        }),
      }}
    >
      <Box
        sx={theme => ({
          flexShrink: 0,
          padding: '8px 16px 12px',
          borderBottom: `1px solid ${theme.design.border}`,
        })}
      >
        {/* The grab handle: the design's cue that this panel came up from the
            bottom edge. It says nothing, so it says nothing to a screen reader. */}
        <Box
          aria-hidden="true"
          sx={theme => ({
            width: 40,
            height: 4,
            borderRadius: 2,
            margin: '6px auto 14px',
            backgroundColor: theme.design.border,
          })}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              component="p"
              sx={theme => ({
                fontSize: '0.6875rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                color: theme.design.textSecondary,
              })}
            >
              PICK COOK {side}
            </Typography>
            {/* The count is against the whole archive rather than against what
                the last narrowing left: "1 of 12 sessions" is the answer to
                "did my search find it", which "1 of 1" is not. */}
            <Typography
              component="h2"
              data-testid="cook-picker-count"
              sx={theme => ({
                fontSize: '1.1875rem',
                fontWeight: 800,
                color: theme.design.text,
              })}
            >
              {shown.length} of {total} sessions
            </Typography>
          </Box>
          <IconButton
            aria-label="Close"
            onClick={onClose}
            sx={theme => ({
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: '11px',
              fontSize: '1.375rem',
              color: theme.design.textSecondary,
            })}
          >
            ×
          </IconButton>
        </Box>

        <InputBase
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search name, meat, wood or date"
          inputProps={{ 'aria-label': 'Search cooks' }}
          startAdornment={
            <Box
              sx={theme => ({
                display: 'flex',
                marginRight: '9px',
                color: theme.design.textSecondary,
              })}
            >
              <SearchIcon size={16} />
            </Box>
          }
          sx={theme => ({
            width: '100%',
            height: 48,
            padding: '0 13px',
            borderRadius: '12px',
            fontSize: '0.9375rem',
            color: theme.design.text,
          })}
        />

        {/* Sort first, then the meats, with a rule between them: they are two
            different questions, and the row runs off the side of a phone rather
            than wrapping, which would push the list off the screen. */}
        <Box
          data-testid="cook-picker-pills"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            overflowX: 'auto',
            margin: '10px -16px 0',
            padding: '0 16px 2px',
            scrollbarWidth: 'none',
          }}
        >
          {SORTS.map(({ sort: order, label }) => (
            <FilterChip
              key={order}
              label={label}
              active={sort === order}
              minHeight={44}
              testId="cook-picker-pill"
              onClick={() => setSort(order)}
            />
          ))}
          <Box
            aria-hidden="true"
            sx={theme => ({
              width: '1px',
              alignSelf: 'stretch',
              flexShrink: 0,
              margin: '4px 3px',
              backgroundColor: theme.design.border,
            })}
          />
          {meatTypes.map(meat => (
            <FilterChip
              key={meat}
              label={meat}
              active={chosen.includes(meat)}
              minHeight={44}
              testId="cook-picker-pill"
              onClick={() => toggleMeat(meat)}
            />
          ))}
        </Box>
      </Box>

      {/* The sheet's own scroll region: the list moves, the header above it and
          the comparison below it do not. */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {shown.length === 0 ? (
          <Box
            data-testid="cook-picker-empty"
            sx={theme => ({
              padding: '40px 16px',
              textAlign: 'center',
              fontSize: '0.875rem',
              color: theme.design.textSecondary,
            })}
          >
            No cooks match that search.
          </Box>
        ) : (
          shown.map(one => (
            <CookRow
              key={one.smokeId}
              cook={one}
              selected={one.smokeId === selectedId}
              taken={otherId !== undefined && one.smokeId === otherId}
              onPick={pick}
            />
          ))
        )}
      </Box>
    </Drawer>
  );
}
