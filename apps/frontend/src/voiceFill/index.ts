/**
 * Voice Fill — the model-free half.
 *
 * The per-screen field definition every extractor adapter derives its
 * constrained-output schema from, and the extraction contract that turns the
 * raw object a model returns into Review rows and a ticked set of rows into the
 * values to write plus what Undo restores.
 */
export type {
  VoiceFillField,
  VoiceFillFieldKey,
  VoiceFillFieldType,
  VoiceFillJsonSchema,
  VoiceFillScreen,
  VoiceFillScreenDefinition,
  VoiceFillToolSchema,
  VoiceFillValueSchema,
} from './fieldDefinition';
export { SCREEN_FIELDS, fieldOf, jsonSchemaFor, toolSchemaFor } from './fieldDefinition';
export type { ReviewRow, VoiceFillScreenValues, VoiceFillWrite } from './extractionContract';
export {
  MAX_REST_MINUTES,
  MAX_WEIGHT,
  MIN_REST_MINUTES,
  NOTES_MERGE_WORD_LIMIT,
  fillFor,
  notesAreMerged,
  reviewRows,
} from './extractionContract';
