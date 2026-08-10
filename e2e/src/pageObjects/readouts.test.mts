/**
 * Unit tests for reading a temperature off the smoke step's readouts.
 *
 * The journeys wait on these readouts to prove the whole pipeline — emulator to
 * device-service to smoker to backend to frontend — is delivering frames. What
 * a readout *displays* is the design's business and has changed before (the
 * rows now carry their unit, "213°F", where they used to show a bare "213"),
 * but what the journey needs from it has not: is this a temperature, and is it
 * a different one than last time.
 *
 * That contract is pinned here, away from Playwright, so a change to the
 * display is caught by a unit test that runs in milliseconds rather than by a
 * thirty-second poll timing out inside a compose stack.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isTemperature, temperatureOf } from './readouts.ts';

describe('temperatureOf', () => {
  it('reads the number off a readout showing its unit', () => {
    assert.equal(temperatureOf('213°F'), 213);
  });

  it('reads one that shows no unit, so the parse describes a temperature rather than a typeface', () => {
    assert.equal(temperatureOf('213'), 213);
  });

  it('reads a fractional reading, and the zero every readout starts at', () => {
    assert.equal(temperatureOf('92.5°F'), 92.5);
    assert.equal(temperatureOf('0°F'), 0);
  });

  it('ignores the whitespace innerText leaves around and inside the reading', () => {
    assert.equal(temperatureOf('  213 °F  '), 213);
  });

  it('answers NaN for anything that is not a reading at all', () => {
    ['', '   ', '°F', 'undefined', 'NaN', '--', '2 1 3'].forEach(displayed =>
      assert.ok(
        Number.isNaN(temperatureOf(displayed)),
        `expected ${JSON.stringify(displayed)} not to read as a temperature`
      )
    );
  });
});

describe('isTemperature', () => {
  it('accepts a live reading, unit and all', () => {
    assert.equal(isTemperature('213°F'), true);
  });

  /**
   * The zero every readout starts at is the "nothing has arrived yet" state the
   * journeys are waiting to leave, so it must keep failing this check — as must
   * everything that is not a reading.
   */
  it('rejects the untouched zero and everything that is not a reading', () => {
    ['0', '0°F', '', '°F', 'undefined'].forEach(displayed =>
      assert.equal(isTemperature(displayed), false, `expected ${JSON.stringify(displayed)} to fail`)
    );
  });
});
