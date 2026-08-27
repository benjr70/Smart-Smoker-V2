/**
 * What colour a stamp is drawn in, given the palette the panel is painting in.
 *
 * A tone is a name, not a colour: `p1` means "the first probe's colour on this
 * screen", so a stamp keeps its identity when the installation changes scheme
 * and a marker on the chart matches the reading it sits beside. The two tones
 * that name no reading — the design's amber, and supporting ink — are what let
 * a stamp stand apart from every line on the plot.
 *
 * The web application resolves the same six names the same way
 * (`components/common/stampTones.ts` there), against the same shared palette,
 * which is what keeps a marker on the pit and the dot beside the same event on
 * a phone one colour.
 */
import { DesignPalette } from 'theme/src';
import { StampTone } from '../api';

/**
 * The design carries no amber token of its own, so the accent stands in for it:
 * it is the warm colour of this palette, it is legible on every surface the
 * design defines, and it moves with the scheme like everything else here.
 */
export const toneColor = (tone: StampTone, design: DesignPalette): string => {
  switch (tone) {
    case 'chamber':
      return design.probes.chamber;
    case 'p1':
      return design.probes.probe1;
    case 'p2':
      return design.probes.probe2;
    case 'p3':
      return design.probes.probe3;
    case 'amber':
      return design.accent;
    default:
      return design.textSecondary;
  }
};
