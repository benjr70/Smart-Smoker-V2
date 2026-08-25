import {
  AlertNames,
  AlertRuntimeState,
  ChamberAlertSettings,
  HeadsUpAlertSettings,
  ProbeTargetAlertSettings,
  SmokeCompleteAlertSettings,
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

/** The smoker's three meat probes, and the target each carries when unwatched. */
const RESTING_TARGETS: Record<string, number> = {
  probe1: 203,
  probe2: 195,
  probe3: 165,
};

/**
 * The Probe Target Reached alert watching exactly the probes named, at the
 * targets given. Every other slot is still present and still carries a target —
 * as it does in a real settings document — so a test that expects silence from
 * an unwatched probe is actually testing the watch flag.
 */
const watching = (
  watched: Record<string, number>,
  overrides: Partial<ProbeTargetAlertSettings> = {},
): ProbeTargetAlertSettings => ({
  enabled: true,
  probes: Object.keys(RESTING_TARGETS).map((slot) => ({
    slot,
    enabled: watched[slot] !== undefined,
    target: watched[slot] ?? RESTING_TARGETS[slot],
  })),
  ...overrides,
});

/** The names this cook's smoke profile gives the smoker's probes. */
const COOK_NAMES: AlertNames = {
  chamber: 'Chamber',
  probes: {
    probe1: 'Brisket Flat',
    probe2: 'Pork Butt',
    probe3: 'Probe 3',
  },
};

const START = new Date('2026-08-02T10:00:00.000Z');
const minutesAfterStart = (minutes: number): Date =>
  new Date(START.getTime() + minutes * 60 * 1000);

/**
 * Feed a cook to the engine one reading at a time and collect everything it
 * decided to send. Each entry is
 * `[minutes since the cook started, chamber °F, probe °F by slot]`, so a test
 * reads as the shape of the cook rather than as a pile of state plumbing — and
 * the engine is exercised exactly as the service drives it: hand it the state it
 * returned last tick.
 */
const runCook = (
  readings: Array<
    [
      number,
      number | null,
      Record<string, number | null>?,
      Record<string, number>?,
    ]
  >,
  options: {
    chamber?: ChamberAlertSettings;
    probeTarget?: ProbeTargetAlertSettings;
    smokeComplete?: SmokeCompleteAlertSettings;
    headsUp?: HeadsUpAlertSettings;
    state?: AlertRuntimeState;
    names?: AlertNames;
  } = {},
) => {
  let state = options.state ?? initialAlertRuntimeState();
  const bodies: string[] = [];
  readings.forEach(([minutes, chamberTemp, probeTemps, etaMinutes]) => {
    const evaluation = evaluateAlerts({
      reading: { chamberTemp, probeTemps: probeTemps ?? {} },
      etaMinutes: etaMinutes ?? {},
      settings: {
        chamber: options.chamber ?? chamberRange(),
        probeTarget: options.probeTarget ?? watching({}, { enabled: false }),
        // Off unless a test asks for it, exactly as an installation that has
        // never configured it reads — so the chamber and probe cases below are
        // about the rule they name and nothing else.
        smokeComplete: options.smokeComplete ?? { enabled: false },
        headsUp: options.headsUp ?? { enabled: false },
      },
      state,
      names: options.names ?? COOK_NAMES,
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
    const settings = {
      chamber: chamberRange(),
      probeTarget: watching({ probe1: 203 }),
      smokeComplete: { enabled: true },
      headsUp: { enabled: true },
    };
    const state = initialAlertRuntimeState();

    const evaluation = evaluateAlerts({
      reading: { chamberTemp: 240, probeTemps: { probe1: 210 } },
      settings,
      state,
      names: COOK_NAMES,
      now: START,
    });

    expect(settings).toEqual({
      chamber: chamberRange(),
      probeTarget: watching({ probe1: 203 }),
      smokeComplete: { enabled: true },
      headsUp: { enabled: true },
    });
    expect(state).toEqual(initialAlertRuntimeState());
    expect(evaluation.state.chamberArmed).toBe(true);
  });
});

describe('alert engine — probe target alerts', () => {
  it('tells the cook when a watched probe reaches its target, by the name this cook gave it', () => {
    const { bodies } = runCook(
      [
        [0, null, { probe1: 68 }],
        [180, null, { probe1: 190 }],
        [240, null, { probe1: 203 }],
      ],
      { probeTarget: watching({ probe1: 203 }) },
    );

    expect(bodies).toEqual(['Brisket Flat reached 203°F.']);
  });

  // A probe that reaches target stays there (or climbs) for the rest of the
  // cook, so a rule without a fired marker would notify on every tick until the
  // meat comes off — thirty seconds apart, for the whole rest.
  it('says it once, however long the probe then sits at or above its target', () => {
    const { bodies } = runCook(
      [
        [180, null, { probe1: 190 }],
        [240, null, { probe1: 203 }],
        [245, null, { probe1: 204 }],
        [300, null, { probe1: 210 }],
        [360, null, { probe1: 203 }],
      ],
      { probeTarget: watching({ probe1: 203 }) },
    );

    expect(bodies).toEqual(['Brisket Flat reached 203°F.']);
  });

  // An unused probe left dangling in open air sits at chamber temperature all
  // cook, which is well past any meat target — so "watched" has to be the only
  // thing that lets a probe speak.
  it('ignores a probe the cook is not watching, however hot it reads', () => {
    const { bodies } = runCook(
      [
        [60, null, { probe1: 203, probe2: 260, probe3: 300 }],
        [120, null, { probe1: 210, probe2: 265, probe3: 310 }],
      ],
      { probeTarget: watching({ probe1: 203 }) },
    );

    expect(bodies).toEqual(['Brisket Flat reached 203°F.']);
  });

  it('gives two meats cooking together their own targets and their own alerts', () => {
    const { bodies } = runCook(
      [
        [180, null, { probe1: 190, probe2: 180 }],
        // The pork butt finishes first, and the brisket is not done yet.
        [240, null, { probe1: 198, probe2: 196 }],
        [300, null, { probe1: 203, probe2: 199 }],
      ],
      { probeTarget: watching({ probe1: 203, probe2: 195 }) },
    );

    expect(bodies).toEqual([
      'Pork Butt reached 196°F.',
      'Brisket Flat reached 203°F.',
    ]);
  });

  it('is inert while switched off, however many watched probes finish', () => {
    const { bodies } = runCook(
      [
        [240, null, { probe1: 210, probe2: 200 }],
        [300, null, { probe1: 215, probe2: 205 }],
      ],
      {
        probeTarget: watching({ probe1: 203, probe2: 195 }, { enabled: false }),
      },
    );

    expect(bodies).toEqual([]);
  });

  // Switching the alert back on mid-cook must not release a backlog: a probe
  // that passed its target while the alert was off has to announce itself on the
  // next reading, not be silently marked as already announced.
  it('leaves no bookkeeping behind while switched off, so switching it on still works', () => {
    const off = runCook([[240, null, { probe1: 210 }]], {
      probeTarget: watching({ probe1: 203 }, { enabled: false }),
    });

    const { bodies } = runCook([[300, null, { probe1: 212 }]], {
      probeTarget: watching({ probe1: 203 }),
      state: off.state,
    });

    expect(bodies).toEqual(['Brisket Flat reached 212°F.']);
  });

  // An unplugged probe reports nothing. Read as 0°F it would be below every
  // target and stay silent, but read as any target-or-above value it would
  // announce meat that is not cooking — so "nothing" must mean nothing.
  it('ignores a watched probe the smoker reported no reading for', () => {
    const { bodies } = runCook(
      [
        [60, null, { probe1: null }],
        [120, null, {}],
        [180, null, { probe1: null }],
      ],
      { probeTarget: watching({ probe1: 203 }) },
    );

    expect(bodies).toEqual([]);
  });

  // The two rules are independent: a dying fire while the brisket finishes is
  // two separate things the cook needs to be told, on the same tick.
  it('reports a chamber excursion and a finished probe from the same reading', () => {
    const { bodies } = runCook(
      [
        [0, 240, { probe1: 150 }],
        [40, 180, { probe1: 190 }],
        [45, 175, { probe1: 205 }],
      ],
      { probeTarget: watching({ probe1: 203 }) },
    );

    expect(bodies).toEqual([
      'Chamber dropped to 175°F, below your 225°F low.',
      'Brisket Flat reached 205°F.',
    ]);
  });

  // The resolver always supplies a name, but a notification that reads
  // "undefined reached 205°F" would be worse than useless if it ever did not.
  it('names the slot itself rather than nothing when no name was resolved for it', () => {
    const { bodies } = runCook([[240, null, { probe3: 170 }]], {
      probeTarget: watching({ probe3: 165 }),
      names: { chamber: 'Chamber', probes: {} },
    });

    expect(bodies).toEqual(['probe3 reached 170°F.']);
  });
});

describe('alert engine — smoke complete alert', () => {
  /** The Smoke Complete alert, switched on. */
  const smokeCompleteOn: SmokeCompleteAlertSettings = { enabled: true };

  it('says nothing while one of the two meats on the smoker is still cooking', () => {
    const { bodies } = runCook(
      [
        [180, null, { probe1: 190, probe2: 180 }],
        // The pork butt is done; the brisket has another hour in it.
        [240, null, { probe1: 190, probe2: 196 }],
      ],
      {
        probeTarget: watching({ probe1: 203, probe2: 195 }),
        smokeComplete: smokeCompleteOn,
      },
    );

    expect(bodies).toEqual(['Pork Butt reached 196°F.']);
  });
  it('tells the cook the smoke is complete when the last watched probe reaches its target', () => {
    const { bodies } = runCook(
      [
        [180, null, { probe1: 190, probe2: 180 }],
        [240, null, { probe1: 190, probe2: 196 }],
        [300, null, { probe1: 204, probe2: 197 }],
      ],
      {
        probeTarget: watching({ probe1: 203, probe2: 195 }),
        smokeComplete: smokeCompleteOn,
      },
    );

    expect(bodies).toEqual([
      'Pork Butt reached 196°F.',
      'Brisket Flat reached 204°F.',
      'Smoke complete — every probe you are watching has reached its target.',
    ]);
  });
  // Meat sits at or above its target for the rest of the cook, so a rule with no
  // fired marker would announce the smoke complete every thirty seconds until
  // someone takes it off.
  it('says it once, however long the meat then rests on the smoker', () => {
    const { bodies } = runCook(
      [
        [300, null, { probe1: 204, probe2: 197 }],
        [330, null, { probe1: 206, probe2: 198 }],
        [360, null, { probe1: 205, probe2: 197 }],
      ],
      {
        probeTarget: watching({ probe1: 203, probe2: 195 }),
        smokeComplete: smokeCompleteOn,
      },
    );

    expect(
      bodies.filter((body) => body.startsWith('Smoke complete')),
    ).toHaveLength(1);
  });
  it('is inert while switched off, however finished the cook is', () => {
    const { bodies, state } = runCook(
      [
        [300, null, { probe1: 204, probe2: 197 }],
        [360, null, { probe1: 205, probe2: 198 }],
      ],
      {
        probeTarget: watching({ probe1: 203, probe2: 195 }),
        smokeComplete: { enabled: false },
      },
    );

    expect(bodies).toEqual([
      'Brisket Flat reached 204°F.',
      'Pork Butt reached 197°F.',
    ]);
    // And it leaves no marker behind, so switching it on mid-rest is not
    // silenced by a completion nobody was ever told about.
    expect(state.smokeCompleteFired).toBe(false);
  });
  // Every probe left dangling in open air sits at chamber temperature, which is
  // past any meat target — so "all of them are done" over an empty watch list
  // would announce a complete smoke to someone who never told it what to watch.
  it('never completes a cook that is watching no probes at all', () => {
    const { bodies } = runCook(
      [
        [60, null, { probe1: 260, probe2: 265, probe3: 300 }],
        [300, null, { probe1: 280, probe2: 285, probe3: 310 }],
      ],
      { probeTarget: watching({}), smokeComplete: smokeCompleteOn },
    );

    expect(bodies).toEqual([]);
  });
  // Only the watch list decides. A probe left in the smoker but not watched is
  // not meat anyone is waiting on, so it must not hold the cook open.
  it('completes on the watched probes alone, ignoring a cold probe nobody is watching', () => {
    const { bodies } = runCook(
      [[300, null, { probe1: 204, probe2: 100, probe3: 80 }]],
      {
        probeTarget: watching({ probe1: 203 }),
        smokeComplete: smokeCompleteOn,
      },
    );

    expect(bodies).toEqual([
      'Brisket Flat reached 204°F.',
      'Smoke complete — every probe you are watching has reached its target.',
    ]);
  });

  // The two probe alerts are switched on and off separately, so silencing the
  // per-probe chatter must not silence the one alert that says the cook is over.
  // The watch list is still what completion is measured against — it just is not
  // the Probe Target Reached alert's to take with it when it goes quiet.
  it('completes even with the per-probe alert switched off, on the same watch list', () => {
    const { bodies } = runCook(
      [
        [180, null, { probe1: 190, probe2: 180 }],
        [300, null, { probe1: 204, probe2: 197 }],
      ],
      {
        probeTarget: watching({ probe1: 203, probe2: 195 }, { enabled: false }),
        smokeComplete: smokeCompleteOn,
      },
    );

    expect(bodies).toEqual([
      'Smoke complete — every probe you are watching has reached its target.',
    ]);
  });

  // Meat that has been announced as done stays done. A probe re-seated into a
  // cooler part of the meat (or one whose reading dips after wrapping) reads
  // below its target again, and judging completion on the current reading alone
  // would leave the cook waiting on meat they were already told about.
  it('holds a probe done once it has been announced, though it reads cooler later', () => {
    const { bodies } = runCook(
      [
        [240, null, { probe1: 204, probe2: 180 }],
        // Wrapped and re-seated: the brisket reads below its target again while
        // the pork butt finishes.
        [300, null, { probe1: 198, probe2: 196 }],
      ],
      {
        probeTarget: watching({ probe1: 203, probe2: 195 }),
        smokeComplete: smokeCompleteOn,
      },
    );

    expect(bodies).toEqual([
      'Brisket Flat reached 204°F.',
      'Pork Butt reached 196°F.',
      'Smoke complete — every probe you are watching has reached its target.',
    ]);
  });

  // The same cook with the per-probe chatter silenced. Nothing else is recording
  // that the brisket was done, so the completion rule has to remember it itself:
  // a probe re-seated (or pulled and unplugged) after it finished must not
  // quietly hold the cook open for the rest of the smoke.
  it('holds a probe done with the per-probe alert switched off, though it then reads cooler', () => {
    const { bodies } = runCook(
      [
        [240, null, { probe1: 204, probe2: 180 }],
        [300, null, { probe1: 198, probe2: 196 }],
        // Pulled and unplugged once it was done: still done.
        [330, null, { probe1: null, probe2: 197 }],
      ],
      {
        probeTarget: watching({ probe1: 203, probe2: 195 }, { enabled: false }),
        smokeComplete: smokeCompleteOn,
      },
    );

    expect(bodies).toEqual([
      'Smoke complete — every probe you are watching has reached its target.',
    ]);
  });

  // Nothing was announced and nothing is complete, so switching the alert on
  // mid-cook must not find a backlog of meat it decided was done while it was
  // off — the same rule the per-probe alert follows.
  it('leaves no bookkeeping behind while switched off, so switching it on still judges the cook fresh', () => {
    const off = runCook([[240, null, { probe1: 204, probe2: 196 }]], {
      probeTarget: watching({ probe1: 203, probe2: 195 }, { enabled: false }),
      smokeComplete: { enabled: false },
    });

    const { bodies } = runCook([[300, null, { probe1: 198, probe2: 190 }]], {
      probeTarget: watching({ probe1: 203, probe2: 195 }, { enabled: false }),
      smokeComplete: smokeCompleteOn,
      state: off.state,
    });

    expect(bodies).toEqual([]);
  });
});

/**
 * The watch list with a heads-up lead on the probes named: each entry is the
 * temperature that probe's meat is done at and how many minutes before that the
 * cook wants to hear about it. Every other slot is present and unwatched, as it
 * is in a real settings document.
 */
const watchingWithLead = (
  watched: Record<string, { target: number; leadMinutes?: number | null }>,
): ProbeTargetAlertSettings => ({
  enabled: true,
  probes: Object.keys(RESTING_TARGETS).map((slot) => ({
    slot,
    enabled: watched[slot] !== undefined,
    target: watched[slot]?.target ?? RESTING_TARGETS[slot],
    leadMinutes: watched[slot]?.leadMinutes ?? null,
  })),
});

describe('alert engine — heads-up alert', () => {
  const headsUpOn: HeadsUpAlertSettings = { enabled: true };
  const watchingProbe1 = watchingWithLead({
    probe1: { target: 170, leadMinutes: 15 },
  });

  it('tells the cook once, on the second consecutive tick the meat is projected inside the lead', () => {
    const { bodies } = runCook(
      [
        [200, 240, { probe1: 150 }, { probe1: 40 }],
        [230, 240, { probe1: 158 }, { probe1: 14 }],
        [231, 240, { probe1: 159 }, { probe1: 12 }],
        [232, 240, { probe1: 160 }, { probe1: 11 }],
      ],
      { probeTarget: watchingProbe1, headsUp: headsUpOn },
    );

    // The projection at the moment it fired, not the lead the cook configured:
    // "about 15 minutes" would be the setting read back rather than news.
    expect(bodies).toEqual([
      'Brisket Flat at 159°F — about 12 minutes from 170°F.',
    ]);
  });

  // A live projection wobbles: one tick under the lead, then back over it, is
  // the rate settling rather than the meat arriving.
  it('says nothing about a single tick under the lead, and counts the run again from scratch afterwards', () => {
    const { bodies } = runCook(
      [
        [230, 240, { probe1: 158 }, { probe1: 12 }],
        [231, 240, { probe1: 158 }, { probe1: 48 }],
        [232, 240, { probe1: 159 }, { probe1: 14 }],
        [233, 240, { probe1: 160 }, { probe1: 13 }],
      ],
      { probeTarget: watchingProbe1, headsUp: headsUpOn },
    );

    expect(bodies).toEqual([
      'Brisket Flat at 160°F — about 13 minutes from 170°F.',
    ]);
  });

  // The Probe Target Reached alert owns that moment. A heads-up arriving after
  // it would tell the cook the meat is fifteen minutes away from a temperature
  // it has already passed.
  it('gives up a probe heads-up silently once the meat gets there first', () => {
    const { bodies } = runCook(
      [
        [230, 240, { probe1: 165 }, { probe1: 10 }],
        // Done before the run of confirming ticks completed.
        [231, 240, { probe1: 171 }, { probe1: 1 }],
        // A probe re-seated cooler afterwards is still meat that is done.
        [232, 240, { probe1: 166 }, { probe1: 9 }],
        [233, 240, { probe1: 167 }, { probe1: 8 }],
      ],
      {
        // The per-probe alert is off, so what is being read here is the
        // heads-up rule's own silence rather than another rule's noise.
        probeTarget: { ...watchingProbe1, enabled: false },
        headsUp: headsUpOn,
      },
    );

    expect(bodies).toEqual([]);
  });

  // Once per probe per cook. Raising the lead is the cook asking for more
  // warning next time, not asking to be told about this meat twice.
  it('does not tell the cook again when the lead is raised after the heads-up fired', () => {
    const fired = runCook(
      [
        [230, 240, { probe1: 158 }, { probe1: 14 }],
        [231, 240, { probe1: 159 }, { probe1: 12 }],
      ],
      { probeTarget: watchingProbe1, headsUp: headsUpOn },
    );

    const { bodies } = runCook(
      [
        [232, 240, { probe1: 160 }, { probe1: 30 }],
        [233, 240, { probe1: 161 }, { probe1: 28 }],
      ],
      {
        probeTarget: watchingWithLead({
          probe1: { target: 170, leadMinutes: 45 },
        }),
        headsUp: headsUpOn,
        state: fired.state,
      },
    );

    expect(fired.bodies).toHaveLength(1);
    expect(bodies).toEqual([]);
  });

  it('is inert while switched off, however close the meat is projected to be', () => {
    const off = runCook(
      [
        [230, 240, { probe1: 158 }, { probe1: 5 }],
        [231, 240, { probe1: 159 }, { probe1: 4 }],
        [232, 240, { probe1: 160 }, { probe1: 3 }],
      ],
      { probeTarget: watchingProbe1, headsUp: { enabled: false } },
    );

    expect(off.bodies).toEqual([]);
    // And nothing was banked while it was off: switching it on mid-cook starts
    // the confirming run from scratch rather than firing on its first tick.
    const { bodies } = runCook([[233, 240, { probe1: 161 }, { probe1: 3 }]], {
      probeTarget: watchingProbe1,
      headsUp: headsUpOn,
      state: off.state,
    });

    expect(bodies).toEqual([]);
  });

  it('says nothing about a probe with no lead set, or one nobody is watching', () => {
    const { bodies } = runCook(
      [
        [230, 240, { probe1: 158, probe2: 190 }, { probe1: 5, probe2: 5 }],
        [231, 240, { probe1: 159, probe2: 191 }, { probe1: 4, probe2: 4 }],
      ],
      {
        probeTarget: watchingWithLead({ probe1: { target: 170 } }),
        headsUp: headsUpOn,
      },
    );

    expect(bodies).toEqual([]);
  });

  // Warming, stalled and paused cooks reach the engine as a slot with no
  // projection at all — the caller only passes on what it has live evidence
  // for — so the rule has to be silent on an absent one rather than read it as
  // "no time left".
  it('says nothing for a probe the caller has no live projection for', () => {
    const { bodies } = runCook(
      [
        [230, 240, { probe1: 158 }, {}],
        [231, 240, { probe1: 159 }, {}],
        [232, 240, { probe1: 160 }, {}],
      ],
      { probeTarget: watchingProbe1, headsUp: headsUpOn },
    );

    expect(bodies).toEqual([]);
  });

  // The bookkeeping is persisted on every tick and read back on the next one,
  // so it has to describe the cook as it is now: a probe nobody asked to be
  // warned about has nothing to spend, and a slot that has stopped being
  // watched has no run of ticks to remember.
  it('keeps no bookkeeping for probes it could never warn about', () => {
    const { state } = runCook(
      [
        // probe2 has no lead; probe1's run is under way.
        [230, 240, { probe1: 158, probe2: 210 }, { probe1: 12, probe2: 1 }],
      ],
      {
        probeTarget: watchingWithLead({
          probe1: { target: 170, leadMinutes: 15 },
          probe2: { target: 195 },
        }),
        headsUp: headsUpOn,
      },
    );

    expect(state.headsUpFired).toEqual([]);
    expect(state.headsUpCounters).toEqual({ probe1: 1 });
  });

  it('forgets the run of a probe that is no longer being watched', () => {
    const started = runCook([[230, 240, { probe1: 158 }, { probe1: 12 }]], {
      probeTarget: watchingProbe1,
      headsUp: headsUpOn,
    });

    const { state } = runCook([[231, 240, { probe1: 159 }, { probe1: 11 }]], {
      probeTarget: watchingWithLead({}),
      headsUp: headsUpOn,
      state: started.state,
    });

    expect(started.state.headsUpCounters).toEqual({ probe1: 1 });
    expect(state.headsUpCounters).toEqual({});
  });
});
