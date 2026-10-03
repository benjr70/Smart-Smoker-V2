/**
 * The per-screen field definition: what a model may return for a Ramble spoken
 * on each screen.
 *
 * The single source every extractor adapter derives its constrained-output
 * dialect from, so two models in the picker can never be asked for two
 * different shapes. It says only what a value *is* — its bounds are
 * deliberately absent, because a constrained decoder given a maximum would bend
 * a misheard value to fit it, and the extraction contract could then no longer
 * reject that value into Notes.
 */
import { WeightUnits } from '../components/common/interfaces/enums';
import { MEAT_TYPES } from '../components/smoke/preSmokeStep/meatTypes';

/** A screen a Ramble can be spoken on. */
export type VoiceFillScreen = 'preSmoke' | 'postSmoke';

/** The plain kinds of value a model is asked for. */
export type VoiceFillFieldType = 'string' | 'number' | 'integer' | 'stringList';

/** One value a model may return for a screen. */
export interface VoiceFillField {
  /** The key the value is returned under in the raw object. */
  key: string;
  /** What the field is called on the screen and in its Review row. */
  label: string;
  type: VoiceFillFieldType;
  /** What the model is told the field is for. */
  description: string;
  /** The only values the field can hold, for one that is a closed choice. */
  options?: readonly string[];
  /** The screen's suggestion list, for a free-text field that offers one. */
  suggestions?: readonly string[];
}

export interface VoiceFillScreenDefinition {
  /** What the screen is called. */
  title: string;
  fields: readonly VoiceFillField[];
}

const NOTES_FIELD: VoiceFillField = {
  key: 'notes',
  label: 'Notes',
  type: 'string',
  description:
    'A summary, in clean sentences, of everything said that did not fit another field: ' +
    'observations, doubts, anything that belongs to another screen, and any value given as a ' +
    'range or as a choice between two. Where existing notes are given, one text that merges ' +
    'them with the summary and keeps every fact and number.',
};

export const SCREEN_FIELDS: Record<VoiceFillScreen, VoiceFillScreenDefinition> = {
  preSmoke: {
    title: 'Pre-smoke',
    fields: [
      {
        key: 'name',
        label: 'Name',
        type: 'string',
        description: 'What the cook is called, only if a name was spoken.',
      },
      {
        key: 'meatType',
        label: 'Meat type',
        type: 'string',
        description: 'The cut of meat, as spoken.',
        suggestions: MEAT_TYPES,
      },
      {
        key: 'weight',
        label: 'Weight',
        type: 'number',
        description:
          'The weight of the meat as a plain number ("twelve and a half" is 12.5). ' +
          'Left out when a range was given.',
      },
      {
        key: 'weightUnit',
        label: 'Unit',
        type: 'string',
        description: 'The unit the weight was given in, only if one was spoken.',
        options: Object.values(WeightUnits),
      },
      {
        key: 'steps',
        label: 'Prep steps',
        type: 'stringList',
        description:
          'Each preparation step as a short phrase in sentence case, one action per step, ' +
          'in the order spoken.',
      },
      NOTES_FIELD,
    ],
  },
  postSmoke: {
    title: 'Post-smoke',
    fields: [
      {
        key: 'restMinutes',
        label: 'Rest time',
        type: 'integer',
        description:
          'How long the meat rested, in minutes ("an hour and fifteen" is 75, ' +
          '"a couple hours" is 120). Left out when the length is vague.',
      },
      {
        key: 'steps',
        label: 'Post-smoke steps',
        type: 'stringList',
        description:
          'Each step taken after the smoke as a short phrase in sentence case, one action ' +
          'per step, in the order spoken.',
      },
      NOTES_FIELD,
    ],
  },
};

/** The schema of one plain value, in the subset every runtime understands. */
export type VoiceFillValueSchema =
  | { type: 'string'; enum?: readonly string[] }
  | { type: 'number' | 'integer' }
  | { type: 'array'; items: { type: 'string' } };

type Described<Schema> = Schema & { description: string };

/** A screen's fields as a JSON Schema, for runtimes that constrain output to one. */
export interface VoiceFillJsonSchema {
  type: 'object';
  properties: Record<
    string,
    Described<VoiceFillValueSchema | { anyOf: [VoiceFillValueSchema, { type: 'null' }] }>
  >;
  required: string[];
  additionalProperties: false;
}

/** A screen's fields as the parameters of one tool, for runtimes that constrain a tool call. */
export interface VoiceFillToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, Described<VoiceFillValueSchema>>;
  };
}

const valueSchemaOf = (field: VoiceFillField): VoiceFillValueSchema => {
  switch (field.type) {
    case 'stringList':
      return { type: 'array', items: { type: 'string' } };
    case 'string':
      return field.options ? { type: 'string', enum: field.options } : { type: 'string' };
    default:
      return { type: field.type };
  }
};

/** What the model is told a field is for, its suggestion list included. */
const descriptionOf = (field: VoiceFillField): string =>
  field.suggestions
    ? `${field.description} Suggestions: ${field.suggestions.join(', ')}.`
    : field.description;

/**
 * A screen's fields as a JSON Schema.
 *
 * Every field is required and — a list aside, which is simply empty — nullable:
 * a constrained decoder fills every key it is given, so "not said" has to be a
 * value the model can write rather than a key it can leave out.
 */
export const jsonSchemaFor = (screen: VoiceFillScreen): VoiceFillJsonSchema => {
  const { fields } = SCREEN_FIELDS[screen];
  const properties: VoiceFillJsonSchema['properties'] = {};
  fields.forEach(field => {
    const value = valueSchemaOf(field);
    properties[field.key] =
      value.type === 'array'
        ? { description: descriptionOf(field), ...value }
        : { description: descriptionOf(field), anyOf: [value, { type: 'null' }] };
  });
  return {
    type: 'object',
    properties,
    required: fields.map(field => field.key),
    additionalProperties: false,
  };
};

/** `preSmoke` as a tool is named: `pre_smoke`. */
const snakeCase = (text: string): string =>
  text.replace(/[A-Z]/g, upper => `_${upper.toLowerCase()}`);

/**
 * A screen's fields as the parameters of one tool call.
 *
 * A tool's parameter schema has no unions, so here "not said" is a parameter
 * the model leaves out: nothing is required and nothing is nullable.
 */
export const toolSchemaFor = (screen: VoiceFillScreen): VoiceFillToolSchema => {
  const { title, fields } = SCREEN_FIELDS[screen];
  const properties: VoiceFillToolSchema['parameters']['properties'] = {};
  fields.forEach(field => {
    properties[field.key] = { description: descriptionOf(field), ...valueSchemaOf(field) };
  });
  return {
    name: `fill_${snakeCase(screen)}`,
    description: `Record the ${title} fields the Ramble mentions. Leave out anything not said.`,
    parameters: { type: 'object', properties },
  };
};
