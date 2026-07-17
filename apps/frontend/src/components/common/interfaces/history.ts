/**
 * The history-row type now lives in the API types module as `SmokeHistory`.
 * This module re-exports it under the legacy `smokeHistory` name so existing
 * component/service imports keep working against the canonical definition.
 */
export type { SmokeHistory as smokeHistory } from '../../../api/types';
