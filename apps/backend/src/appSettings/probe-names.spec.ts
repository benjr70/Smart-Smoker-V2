import { SmokeProfile } from '../smokeProfile/smokeProfile.schema';
import { resolveProbeNames } from './probe-names';

const profile = (overrides: Partial<SmokeProfile> = {}): SmokeProfile => ({
  chamberName: 'Chamber',
  probe1Name: 'Brisket Flat',
  probe2Name: 'Pork Butt',
  probe3Name: 'Ribs',
  notes: '',
  woodType: '',
  ...overrides,
});

describe('probe names', () => {
  it('calls each probe what the active cook called it', () => {
    expect(resolveProbeNames(profile())).toEqual({
      probe1: 'Brisket Flat',
      probe2: 'Pork Butt',
      probe3: 'Ribs',
    });
  });

  it('falls back to the slot label for a probe this cook never named', () => {
    expect(
      resolveProbeNames(profile({ probe2Name: '', probe3Name: '   ' })),
    ).toEqual({
      probe1: 'Brisket Flat',
      probe2: 'Probe 2',
      probe3: 'Probe 3',
    });
  });

  // Settings are read (and named) whether or not anything is cooking, so the
  // page has to render before the first smoke profile of the session exists.
  it('falls back to the slot labels entirely when no session is active', () => {
    expect(resolveProbeNames(null)).toEqual({
      probe1: 'Probe 1',
      probe2: 'Probe 2',
      probe3: 'Probe 3',
    });
  });

  // A cook started from pre-smoke has a smoke before it has a smoke profile.
  // The profile service answers that window with placeholders of its own
  // ("Probe1", no space) — which are not names the user chose, and not the
  // labels this feature shows, so they must not win over the generic fallback.
  it('falls back to the slot label while the cook has no smoke profile saved yet', () => {
    expect(
      resolveProbeNames({
        chamberName: 'Chamber',
        probe1Name: 'Probe1',
        probe2Name: 'Probe2',
        probe3Name: 'Probe3',
      }),
    ).toEqual({
      probe1: 'Probe 1',
      probe2: 'Probe 2',
      probe3: 'Probe 3',
    });
  });

  // A profile read straight out of Mongo omits fields that were never written,
  // rather than carrying them as empty strings.
  it('falls back for a field the stored profile does not carry at all', () => {
    expect(resolveProbeNames({ probe1Name: 'Brisket Flat' })).toEqual({
      probe1: 'Brisket Flat',
      probe2: 'Probe 2',
      probe3: 'Probe 3',
    });
  });
});
