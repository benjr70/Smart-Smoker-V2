import { BatchTempDto, SessionApiPort, SmokeProfile, SmokingState } from 'smoke-session/src';
import { UNREPORTED } from 'temperaturechart/src/chartGeometry';
import {
  getCookStart as getCookStartService,
  getCurrentSmokeProfile,
  getState,
  toggleSmoking as toggleSmokingService,
} from '../services/stateService';
import { getCurrentTemps, postTempsBatch } from '../services/tempsService';

/**
 * The smoker-role HTTP surface, adapting the app's existing axios services to
 * the shared {@link SessionApiPort}. This is the one place the smoker maps
 * backend shapes into session domain shapes; the store and component speak only
 * the port.
 *
 * `saveProfile` is intentionally unsupported: the smoker touchscreen is a
 * display/relay for the profile (names arrive over `smokeUpdate`) and never
 * persists it, so a call is a wiring bug rather than a silent no-op.
 */
/**
 * One temperature, as a number, whatever the wire made of it.
 *
 * The temps collection stores every reading as a string, so `GET temps` answers
 * with `"225"` where {@link BatchTempDto} promises 225 — a lie the type cannot
 * see. The chart's geometry asks whether a reading is a finite number before it
 * plots it, and `"225"` is not one, so a stored cook read back raw draws as four
 * empty lines over an axis of nothing: a kiosk switched on mid-cook, or one
 * coming back from the wifi screen, would show none of the smoke so far.
 *
 * A value that is no number at all is read as the zero the hardware sends for a
 * probe that is not plugged in, which the chart draws as a gap. Passing it on
 * would be worse than dropping it: an unparseable reading plotted anyway is a
 * temperature the smoker never reached.
 *
 * This mirrors `asReading` in `apps/frontend/src/api/client.ts`, which is the
 * same coercion on the web application's read path.
 */
const asReading = (value: number | string | null | undefined): number => {
  const reading = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(reading) ? reading : UNREPORTED;
};

/**
 * A stored cook with every reading as the number its type claims it is.
 *
 * Done here, at the read path, rather than in the screen's series hook: this is
 * the one place a stored cook enters the smoker app, so every consumer of it —
 * the chart's baseline today, anything else tomorrow — is handed the shape the
 * port already promises rather than each minding a wire format of its own.
 *
 * Order is left alone: the chart's own `decimate` puts a cook in time order
 * before it draws or thins it, so there is nothing to settle here.
 */
const asStoredCook = (raw: BatchTempDto[]): BatchTempDto[] =>
  raw.map(temp => ({
    ...temp,
    ChamberTemp: asReading(temp.ChamberTemp),
    MeatTemp: asReading(temp.MeatTemp),
    Meat2Temp: asReading(temp.Meat2Temp),
    Meat3Temp: asReading(temp.Meat3Temp),
  }));

export function createSmokerSessionApi(): SessionApiPort {
  return {
    async getProfile(): Promise<SmokeProfile | null> {
      const profile = await getCurrentSmokeProfile();
      return profile ?? null;
    },
    async saveProfile(): Promise<void> {
      throw new Error('smoker role does not persist the smoke profile');
    },
    async getSmokingState(): Promise<SmokingState> {
      const state = await getState();
      return { smoking: state.smoking, smokeId: state.smokeId };
    },
    async toggleSmoking(): Promise<SmokingState> {
      const state = await toggleSmokingService();
      return { smoking: state.smoking, smokeId: state.smokeId };
    },
    async getCurrentTemps(): Promise<BatchTempDto[]> {
      return asStoredCook(await getCurrentTemps());
    },
    getCookStart(smokeId?: string): Promise<Date | null> {
      return getCookStartService(smokeId);
    },
    async postTempsBatch(batch: BatchTempDto[]): Promise<void> {
      await postTempsBatch(batch);
    },
  };
}
