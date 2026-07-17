/**
 * The smoke-session state type now lives in the API types module. This module
 * re-exports it so existing component/service imports keep working while the
 * client and services import the canonical definition from `../../../api/types`.
 */
export type { State } from '../../../api/types';
