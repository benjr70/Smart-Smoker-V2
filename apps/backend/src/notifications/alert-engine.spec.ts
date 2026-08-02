import {
  AlertRuntimeState,
  ChamberAlertSettings,
  evaluateAlerts,
  initialAlertRuntimeState,
} from './alert-engine';

const chamberRange = (
  overrides: Partial<ChamberAlertSettings> = {},
): ChamberAlertSettings => ({
  enabled: true,
  low: 225,
  high: 275,
  ...overrides,
});

const START = new Date('2026-08-02T10:00:00.000Z');
const minutesAfterStart = (minutes: number): Date =>
  new Date(START.getTime() + minutes * 60 * 1000);

/**
 * Feed a cook to the engine one reading at a time and collect everything it
 * decided to send. Each entry is `[minutes since the cook started, chamber °F]`,
 * so a test reads as the shape of the cook rather than as a pile of state
 * plumbing — and the engine is exercised exactly as the service drives it:
 * hand it the state it returned last tick.
 */
const runCook = (
  readings: Array<[number, number | null]>,
  options: { chamber?: ChamberAlertSettings; state?: AlertRuntimeState } = {},
) => {
  let state = options.state ?? initialAlertRuntimeState();
  const bodies: string[] = [];
  readings.forEach(([minutes, chamberTemp]) => {
    const evaluation = evaluateAlerts({
      reading: { chamberTemp },
      settings: { chamber: options.chamber ?? chamberRange() },
      state,
      names: { chamber: 'Chamber' },
      now: minutesAfterStart(minutes),
    });
    bodies.push(...evaluation.notifications.map((sent) => sent.body));
    state = evaluation.state;
  });
  return { bodies, state };
};

describe('alert engine — chamber temperature alert', () => {
  it('stays silent through a preheat that has never reached the range, however cold and however long', () => {
    const { bodies } = runCook([
      [0, 68],
      [10, 90],
      [20, 140],
      [30, 190],
      [40, 210],
    ]);

    expect(bodies).toEqual([]);
  });

  it('alerts once the chamber has reached the range and then stayed out of it past the sustained window', () => {
    const { bodies } = runCook([
      [0, 68],
      [30, 240],
      [40, 180],
      [45, 180],
    ]);

    expect(bodies).toEqual(['Chamber dropped to 180°F, below your 225°F low.']);
  });

  it('says nothing about a lid-open dip, and a later dip of the same length is just as silent', () => {
    // Two separate one-minute dips: neither reaches the sustained window, and
    // the return to range in between must clear the first excursion — if it did
    // not, the second dip would be measured from the first and alert.
    const { bodies } = runCook([
      [30, 240],
      [40, 180],
      [41, 245],
      [50, 180],
      [51, 245],
    ]);

    expect(bodies).toEqual([]);
  });

  it('tells the cook once about a dying fire, not once every tick it stays cold', () => {
    const { bodies } = runCook([
      [30, 240],
      [40, 180],
      [45, 175],
      [50, 170],
      [60, 160],
    ]);

    // The one alert reports the reading measured when it fired (175°F at
    // minute 45), not the reading that started the excursion.
    expect(bodies).toEqual(['Chamber dropped to 175°F, below your 225°F low.']);
  });

  it('re-arms when the fire recovers, so a second excursion later in the cook still reaches the cook', () => {
    const { bodies } = runCook([
      [30, 240],
      [40, 180],
      [45, 175],
      [60, 245],
      [90, 190],
      [95, 185],
    ]);

    expect(bodies).toEqual([
      'Chamber dropped to 175°F, below your 225°F low.',
      'Chamber dropped to 185°F, below your 225°F low.',
    ]);
  });

  it('treats a runaway fire the same way as a dying one, naming the high bound instead', () => {
    const { bodies } = runCook([
      [30, 240],
      [40, 300],
      [41, 305],
      [45, 310],
      [50, 320],
    ]);

    expect(bodies).toEqual([
      'Chamber climbed to 310°F, above your 275°F high.',
    ]);
  });

  it('is inert while disabled, whatever the chamber does', () => {
    const { bodies } = runCook(
      [
        [30, 240],
        [40, 180],
        [45, 175],
        [60, 340],
        [90, 340],
      ],
      { chamber: chamberRange({ enabled: false }) },
    );

    expect(bodies).toEqual([]);
  });

  // A chamber probe reporting nothing used to be read as 0°F, which is below
  // every low bound — so an unplugged probe alerted for the whole cook.
  it('ignores a reading the smoker never produced rather than treating it as freezing', () => {
    const { bodies } = runCook([
      [30, 240],
      [40, null],
      [45, null],
      [90, null],
    ]);

    expect(bodies).toEqual([]);
  });

  // Evaluation must be safe to run against documents someone else owns: the
  // settings are being edited in the UI, and the runtime state is persisted by
  // the caller only after it decides to.
  it('leaves the settings and the state it was handed untouched, answering with a new state', () => {
    const settings = { chamber: chamberRange() };
    const state = initialAlertRuntimeState();

    const evaluation = evaluateAlerts({
      reading: { chamberTemp: 240 },
      settings,
      state,
      names: { chamber: 'Chamber' },
      now: START,
    });

    expect(settings).toEqual({ chamber: chamberRange() });
    expect(state).toEqual(initialAlertRuntimeState());
    expect(evaluation.state.chamberArmed).toBe(true);
  });
});
