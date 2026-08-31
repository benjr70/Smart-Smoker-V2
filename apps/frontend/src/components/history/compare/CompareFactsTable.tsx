/**
 * The smoke facts, cook against cook.
 *
 * What both cooks did the same way is drawn in the secondary colour, so the
 * eye lands on the differences — which is the only reason the table exists.
 */
import { Box, Card } from '@mui/material';
import React from 'react';
import { CompareCook } from '../../../api';
import { compareFacts } from './compareFacts';

export interface CompareFactsTableProps {
  a: CompareCook;
  b: CompareCook;
}

export function CompareFactsTable({ a, b }: CompareFactsTableProps): JSX.Element {
  const facts = compareFacts(a, b);

  return (
    <Card data-testid="compare-facts" sx={{ padding: '4px 16px' }}>
      {facts.map((fact, index) => (
        <Box
          key={fact.label}
          data-testid="compare-fact-row"
          data-fact={fact.label}
          sx={theme => ({
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 0',
            borderBottom: index === facts.length - 1 ? 'none' : `1px solid ${theme.design.border}`,
          })}
        >
          <Box
            component="span"
            sx={theme => ({
              width: 104,
              flexShrink: 0,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: theme.design.textSecondary,
            })}
          >
            {fact.label}
          </Box>
          {(['a', 'b'] as const).map(side => (
            <Box
              key={side}
              component="span"
              data-testid={`compare-fact-${side}`}
              sx={theme => ({
                flex: 1,
                minWidth: 0,
                fontSize: '0.875rem',
                fontWeight: 700,
                textAlign: side === 'b' ? 'right' : 'left',
                color: fact.same ? theme.design.textSecondary : theme.design.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              })}
            >
              {fact[side]}
            </Box>
          ))}
        </Box>
      ))}
    </Card>
  );
}
