/**
 * Shared frontend API domain (wire) types.
 *
 * This module is the single place API domain types live so that services never
 * import types from React components. Additional resource types are added here
 * as each migration slice lands.
 */
import { TempData } from 'temperaturechart/src/tempChart';

export type { TempData };
