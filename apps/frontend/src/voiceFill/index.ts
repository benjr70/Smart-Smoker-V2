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
 *
 * And the half that gets the models onto the phone: the Model registry the
 * settings card lists, the Model library that picks, downloads and proves
 * them, the card itself, and the grey pill that stands in for the button until
 * the picked pair is ready.
 */
export type {
  VoiceFillField,
  VoiceFillContext,
  VoiceFillFieldKey,
  VoiceFillFieldType,
  VoiceFillJsonSchema,
  VoiceFillPart,
  VoiceFillRecordSchema,
  VoiceFillScreen,
  VoiceFillScreenDefinition,
  VoiceFillToolSchema,
  VoiceFillValueSchema,
} from './fieldDefinition';
export { SCREEN_FIELDS, fieldOf, jsonSchemaFor, toolSchemaFor } from './fieldDefinition';
export type {
  ReviewRow,
  SmokeScreenCurrent,
  SmokeScreenValues,
  VoiceFillProbeTarget,
  VoiceFillScreenValues,
  VoiceFillStamp,
  VoiceFillWrite,
} from './extractionContract';
export {
  MAX_PROBE_TARGET,
  MAX_REST_MINUTES,
  MAX_SERVE_AHEAD_MINUTES,
  MAX_WEIGHT,
  MIN_PROBE_TARGET,
  MIN_REST_MINUTES,
  NOTES_MERGE_WORD_LIMIT,
  fillFor,
  notesAreMerged,
  reviewRows,
  tickedAfterToggle,
} from './extractionContract';
export type { ExtractionContext, ExtractorPort, SpeechPort } from './ports';
export { MICROPHONE_BLOCKED_ERROR, isMicrophoneBlocked } from './ports';
export type { FakeExtractorScript, FakeSpeechScript } from './fakeAdapters';
export { createFakeExtractor, createFakeSpeech } from './fakeAdapters';
export type {
  ScreenBinding,
  VoiceFillSession,
  VoiceFillSessionOptions,
  VoiceFillState,
} from './session';
export { PROBLEM_CAP_MS, TOAST_MS, createVoiceFillSession } from './session';
export type { VoiceFillPorts, VoiceFillPortsProviderProps } from './VoiceFillPortsProvider';
export { VoiceFillPortsProvider, useVoiceFillPorts } from './VoiceFillPortsProvider';
export { useScreenBinding } from './useScreenBinding';
export type { VoiceFill, VoiceFillOptions } from './useVoiceFill';
export { useVoiceFill } from './useVoiceFill';
export type { FilledFlashProps } from './FilledFlash';
export { FLASH_MS, FilledFlash } from './FilledFlash';
export type { VoiceFillModelsProps } from './scriptedModels';
export {
  SCRIPTED_MODELS,
  SCRIPTED_MODELS_QUERY,
  SCRIPTED_MODEL_LIBRARY_STORAGE_KEY,
  SCRIPTED_PHONE_QUERY,
  SCRIPTED_RAMBLE,
  VoiceFillModels,
  scriptedModelsAreOn,
  scriptedPhoneIsCapable,
} from './scriptedModels';
export { VOICE_FILL_BUTTON_CLEARANCE } from './VoiceFillControls';
export type { ModelPair, ModelRegistry, ModelRole, VoiceFillModel } from './modelRegistry';
export { MODEL_ROLES, REGISTERED_MODELS, createModelRegistry, formatBytes } from './modelRegistry';
export type {
  ConnectionPort,
  ModelDownloader,
  ModelLibrary,
  ModelLibraryOptions,
  ModelLibraryState,
  ModelStatus,
  PairReadiness,
} from './modelLibrary';
export {
  MAX_RETRY_DELAY_MS,
  MODEL_LIBRARY_STORAGE_KEY,
  NOT_DOWNLOADED,
  RETRY_DELAY_MS,
  createModelLibrary,
  isArriving,
  isDownloaded,
  pairReadiness,
  percentOf,
  pickedModel,
  statusOf,
} from './modelLibrary';
export type { FakeDownloaderScript } from './fakeDownloader';
export { createFakeDownloader } from './fakeDownloader';
export type { PhoneEnvironment } from './phoneEnvironment';
export { browserConnection, canRunVoiceFill } from './phoneEnvironment';
export type { ModelLibraryProviderProps, ModelLibraryView } from './ModelLibraryProvider';
export {
  ModelLibraryProvider,
  useModelLibrary,
  useSupportedModelLibrary,
} from './ModelLibraryProvider';
export { VoiceFillSettingsCard } from './VoiceFillSettingsCard';
