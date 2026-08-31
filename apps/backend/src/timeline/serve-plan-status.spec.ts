import { servePlanStatus } from './serve-plan-status';

const SERVE_AT = new Date('2026-08-30T18:00:00.000Z');

/** A plan to serve at 18:00 after a one-hour rest: pull by 17:00. */
const plan = (overrides: Partial<Parameters<typeof servePlanStatus>[0]> = {}) =>
  servePlanStatus({
    serveAt: SERVE_AT,
    restMinutes: 60,
    eta: null,
    driftMin: 30,
    wrapTemp: 165,
    wrapStamped: true,
    probeTemp: 150,
    ...overrides,
  });

describe('servePlanStatus', () => {
  it('works the pull-by time back from serve time and the rest', () => {
    expect(plan()?.pullBy).toEqual(new Date('2026-08-30T17:00:00.000Z'));
  });

  /**
   * The verdict, against a plan pulling by 17:00 with half an hour of
   * tolerance. Positive slack is cushion; negative is running late. The
   * boundary cases are here on purpose: exactly the tolerance off plan is what
   * the user said they would accept.
   */
  describe.each`
    label                      | eta                           | slack  | verdict
    ${'an hour of cushion'}    | ${'2026-08-30T16:00:00.000Z'} | ${60}  | ${'early'}
    ${'exactly the tolerance'} | ${'2026-08-30T16:30:00.000Z'} | ${30}  | ${'ontrack'}
    ${'right on the pull-by'}  | ${'2026-08-30T17:00:00.000Z'} | ${0}   | ${'ontrack'}
    ${'a tolerance late'}      | ${'2026-08-30T17:30:00.000Z'} | ${-30} | ${'ontrack'}
    ${'a minute past that'}    | ${'2026-08-30T17:31:00.000Z'} | ${-31} | ${'behind'}
    ${'an hour late'}          | ${'2026-08-30T18:00:00.000Z'} | ${-60} | ${'behind'}
  `('with an ETA $label', ({ eta, slack, verdict }) => {
    it(`is ${verdict} with ${slack} minutes of slack`, () => {
      const status = plan({ eta: new Date(eta as string) });

      expect(status?.slackMinutes).toBe(slack);
      expect(status?.verdict).toBe(verdict);
    });
  });

  it('is a minute early past the tolerance', () => {
    const status = plan({ eta: new Date('2026-08-30T16:29:00.000Z') });

    expect(status?.slackMinutes).toBe(31);
    expect(status?.verdict).toBe('early');
  });

  it('judges nothing while no trustworthy ETA exists', () => {
    const status = plan({ eta: null });

    expect(status?.slackMinutes).toBeNull();
    expect(status?.verdict).toBe('unknown');
  });

  it('has nothing to say about a cook with no serve time', () => {
    expect(plan({ serveAt: null })).toBeNull();
  });

  it('pulls a plan stored without a rest at the serve time itself', () => {
    const status = plan({ restMinutes: null });

    expect(status?.restMinutes).toBe(0);
    expect(status?.pullBy).toEqual(SERVE_AT);
  });

  it('answers cushion in whole minutes', () => {
    // Thirty-seven seconds past the pull-by time is a minute late, not
    // "-0.6166666666666667" for a client to render verbatim.
    const status = plan({ eta: new Date('2026-08-30T17:00:37.000Z') });

    expect(status?.slackMinutes).toBe(-1);
    expect(status?.verdict).toBe('ontrack');
  });

  describe('milestones', () => {
    it('reads as a schedule: pull by 17:00, rest until the serve time', () => {
      expect(plan()?.milestones).toEqual([
        {
          kind: 'pullBy',
          at: new Date('2026-08-30T17:00:00.000Z'),
          temp: null,
        },
        { kind: 'restUntil', at: SERVE_AT, temp: null },
      ]);
    });

    it('hints at the wrap still ahead while the meat is short of it', () => {
      const status = plan({ wrapStamped: false, probeTemp: 150 });

      expect(status?.milestones[0]).toEqual({
        kind: 'wrap',
        at: null,
        temp: 165,
      });
    });

    it('drops the hint once a wrap has been stamped', () => {
      const status = plan({ wrapStamped: true, probeTemp: 150 });

      expect(status?.milestones.map((one) => one.kind)).not.toContain('wrap');
    });

    it('drops the hint once the meat is past the wrap temperature', () => {
      const status = plan({ wrapStamped: false, probeTemp: 165 });

      expect(status?.milestones.map((one) => one.kind)).not.toContain('wrap');
    });

    /**
     * Nothing is watched, or the watched probe has read nothing: there is no
     * temperature to say the meat is short of the wrap, so the plan says
     * nothing rather than hinting at a wrap the meat may be long past.
     */
    it('says nothing about the wrap with no reading to judge it by', () => {
      const status = plan({ wrapStamped: false, probeTemp: null });

      expect(status?.milestones.map((one) => one.kind)).not.toContain('wrap');
    });
  });
});
