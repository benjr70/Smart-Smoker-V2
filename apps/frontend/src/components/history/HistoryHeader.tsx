import { Box, IconButton, InputBase, Typography } from '@mui/material';
import React from 'react';
import { SearchIcon } from '../common/components/DesignIcons';

export interface HistoryHeaderProps {
  /** How many cooks there are in all. */
  total: number;
  /** How many of them the list is showing. */
  showing: number;
  /** Whether a search or a chip is narrowing the list. */
  filtering: boolean;
  /** The search text, as typed. */
  query: string;
  /** Called with the search text whenever it changes, including when it is cleared. */
  onQueryChange: (query: string) => void;
  /** Every meat the history holds — one chip each. */
  meatTypes: readonly string[];
  /** The meats currently chosen; empty means every meat. */
  meats: readonly string[];
  /** Called with a meat when its chip is pressed, to add or drop that meat. */
  onToggleMeat: (meat: string) => void;
  /** Called when the "All" chip is pressed, to drop every chosen meat. */
  onClearMeats: () => void;
}

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

/**
 * One filter chip: a pill that is either in effect or not.
 *
 * A toggle, so it says so (`aria-pressed`) — the design tells the two states
 * apart by colour alone, which is nothing at all to a screen reader.
 */
function FilterChip({ label, active, onClick }: FilterChipProps): JSX.Element {
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={active}
      onClick={onClick}
      sx={theme => ({
        flexShrink: 0,
        height: 36,
        padding: '0 14px',
        borderRadius: '18px',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: '0.8125rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        backgroundColor: active ? theme.design.accent : theme.design.surfaceAlt,
        color: active
          ? theme.palette.getContrastText(theme.design.accent)
          : theme.design.textSecondary,
        border: `1.5px solid ${active ? theme.design.accent : theme.design.border}`,
        transition: 'background-color 150ms ease, color 150ms ease',
      })}
    >
      {label}
    </Box>
  );
}

/**
 * The history screen's header: what the screen is, and how much of it is in
 * view.
 *
 * Sticky rather than fixed, like the wizard's header: it takes its own space in
 * the column instead of covering the first card.
 */
export function HistoryHeader({
  total,
  showing,
  filtering,
  query,
  onQueryChange,
  meatTypes,
  meats,
  onToggleMeat,
  onClearMeats,
}: HistoryHeaderProps): JSX.Element {
  return (
    <Box
      component="header"
      data-testid="history-header"
      sx={theme => ({
        position: 'sticky',
        top: 0,
        zIndex: theme.zIndex.appBar,
        backgroundColor: theme.design.background,
        borderBottom: `1px solid ${theme.design.border}`,
        padding: '16px 16px 12px',
      })}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box>
          <Typography
            component="p"
            sx={theme => ({
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.14em',
              lineHeight: 1.3,
              color: theme.design.textSecondary,
            })}
          >
            SMART SMOKER
          </Typography>
          <Typography
            component="h1"
            sx={theme => ({
              fontSize: '1.25rem',
              fontWeight: 800,
              lineHeight: 1.2,
              color: theme.design.text,
            })}
          >
            History
          </Typography>
        </Box>
        {/* While the list is narrowed the count says how much of the history is
            being hidden — "1 of 12" is the answer to "did my filter work?",
            which "1 session" is not. */}
        <Typography
          component="p"
          data-testid="history-count"
          sx={theme => ({ fontSize: '0.8125rem', color: theme.design.textSecondary })}
        >
          {filtering ? `${showing} of ${total}` : `${total} sessions`}
        </Typography>
      </Box>

      <InputBase
        type="search"
        value={query}
        onChange={event => onQueryChange(event.target.value)}
        placeholder="Search sessions, wood, notes…"
        inputProps={{ 'aria-label': 'Search smoke history' }}
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
        endAdornment={
          // Only there when there is something to clear: an always-present ×
          // beside an empty field is a control that does nothing.
          query !== '' ? (
            <IconButton
              aria-label="Clear search"
              onClick={() => onQueryChange('')}
              sx={theme => ({
                width: 32,
                height: 32,
                borderRadius: '8px',
                fontSize: '1.0625rem',
                color: theme.design.textSecondary,
              })}
            >
              ×
            </IconButton>
          ) : null
        }
        // Neither fill nor hairline here: the theme gives every input base the
        // design's field colour and its 1.5px input border, so hand-written
        // ones would be a second place to change them and a chance for this
        // field to drift from the rest of them. Only the radius this particular
        // field is drawn with is its own.
        sx={theme => ({
          marginTop: '12px',
          width: '100%',
          height: 44,
          padding: '0 6px 0 13px',
          borderRadius: '11px',
          fontSize: '0.9375rem',
          color: theme.design.text,
        })}
      />

      {/* The chips run off the side of a phone rather than wrapping onto a
          second row: the header is sticky, and a row that grows with the number
          of meats would eat the list it sits above. The negative margin lets
          the row scroll edge to edge while its first chip still lines up with
          the rest of the header. */}
      <Box
        data-testid="history-meat-chips"
        sx={{
          display: 'flex',
          gap: '7px',
          overflowX: 'auto',
          margin: '10px -16px 0',
          padding: '0 16px 2px',
          scrollbarWidth: 'none',
        }}
      >
        <FilterChip label="All" active={meats.length === 0} onClick={onClearMeats} />
        {meatTypes.map(meat => (
          <FilterChip
            key={meat}
            label={meat}
            active={meats.includes(meat)}
            onClick={() => onToggleMeat(meat)}
          />
        ))}
      </Box>
    </Box>
  );
}
