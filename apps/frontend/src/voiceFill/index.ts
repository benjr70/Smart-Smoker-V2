/**
 * Voice Fill — the model-free half.
 *
 * The per-screen field definition every extractor adapter derives its
 * constrained-output schema from, and the extraction contract that turns the
 * raw object a model returns into Review rows and a ticked set of rows into the
 * values to write plus what Undo restores.
 *
 * And the half that runs a Ramble: the two ports the models sit behind and
 * their scripted fakes, the session that takes a Ramble from the tap that
 * starts it to its Undo, and the button, sheet and toast a screen shows it in.
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
export type { ExtractionContext, ExtractorPort, SpeechPort } from './ports';
export type { FakeExtractorScript, FakeSpeechScript } from './fakeAdapters';
export { createFakeExtractor, createFakeSpeech } from './fakeAdapters';
export type {
  ScreenBinding,
  VoiceFillSession,
  VoiceFillSessionOptions,
  VoiceFillState,
} from './session';
export { TOAST_MS, createVoiceFillSession } from './session';
export type { VoiceFillPorts, VoiceFillPortsProviderProps } from './VoiceFillPortsProvider';
export { VoiceFillPortsProvider, useVoiceFillPorts } from './VoiceFillPortsProvider';
export { useScreenBinding } from './useScreenBinding';
export type { VoiceFill } from './useVoiceFill';
export { FLASH_MS, useVoiceFill } from './useVoiceFill';
export { VOICE_FILL_BUTTON_CLEARANCE } from './VoiceFillControls';
