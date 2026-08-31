/**
 * Which colour means which cook.
 *
 * Colour is the one thing that identifies a cook across the whole comparison —
 * slot card, summary, notes, and (in the chart slice) every line drawn from that
 * cook's readings — so the pairing is decided once, here, from the design's own
 * probe tokens rather than restated on each card that needs it.
 */
import { useTheme } from '@mui/material';

/** The two slots' colours, as the design names them. */
export interface CompareSlotColors {
  a: string;
  b: string;
}

export function useCompareSlotColors(): CompareSlotColors {
  const { design } = useTheme();
  return { a: design.probes.probe2, b: design.probes.chamber };
}
