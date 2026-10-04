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
import { WOOD_TYPES } from '../components/smoke/smokeStep/woodTypes';

/** A screen a Ramble can be spoken on. */
export type VoiceFillScreen = 'preSmoke' | 'smoke' | 'postSmoke';

/** The plain kinds of value a model is asked for. */
export type VoiceFillFieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'stringList'
  | 'recordList';

/** One plain value inside each entry of a list of records. */
export interface VoiceFillPart {
  /** The key the value is returned under in its entry. */
  key: string;
  type: 'string' | 'integer';
  /** What the model is told the value is for. */
  description: string;
}

/** One value a model may return for a screen. */
export interface VoiceFillField {
  /** The key the value is returned under in the raw object. */
  key: string;
  /**
   * What the field is called in its Review row and in Notes: the review list's
   * own sentence-case wording, which is not the heading the screen gives it.
   */
  label: string;
  type: VoiceFillFieldType;
  /** What the model is told the field is for. */
  description: string;
  /** The only values the field can hold, for one that is a closed choice. */
  options?: readonly string[];
  /** The screen's suggestion list, for a free-text field that offers one. */
  suggestions?: readonly string[];
  /** What each entry holds, for a list of records. */
  parts?: readonly VoiceFillPart[];
}

export interface VoiceFillScreenDefinition {
  /** What the screen is called. */
  title: string;
  fields: readonly VoiceFillField[];
}

/** A field less its key, which is the name it is defined under. */
type FieldSpec = Omit<VoiceFillField, 'key'>;

/**
 * A screen's fields, each under the key a model returns it by. The keys are
 * kept as they are written, so a field can only ever be asked for by a key its
 * screen has.
 */
const fields = <Key extends string>(specs: Record<Key, FieldSpec>): Record<Key, FieldSpec> => specs;

const NOTES_FIELD: FieldSpec = {
  label: 'Notes',
  type: 'string',
  description:
    'A summary, in clean sentences, of everything said that did not fit another field: ' +
    'observations, doubts, anything that belongs to another screen, and any value given as a ' +
    'range or as a choice between two. Where existing notes are given, one text that merges ' +
    'them with the summary and keeps every fact and number.',
};

/** The name of what one of the three meat probes is in. */
const probeName = (probe: number): FieldSpec => ({
  label: `Probe ${probe} name`,
  type: 'string',
  description:
    `What probe ${probe} is in, as a short name, only if it was given one ` +
    `("probe ${probe} is in the flat" is "Flat").`,
});

const FIELDS = {
  preSmoke: fields({
    name: {
      label: 'Name',
      type: 'string',
      description: 'What the cook is called, only if a name was spoken.',
    },
    meatType: {
      label: 'Meat type',
      type: 'string',
      description: 'The cut of meat, as spoken.',
      suggestions: MEAT_TYPES,
    },
    weight: {
      label: 'Weight',
      type: 'number',
      description:
        'The weight of the meat as a plain number ("twelve and a half" is 12.5). ' +
        'Left out when a range was given.',
    },
    weightUnit: {
      label: 'Unit',
      type: 'string',
      description: 'The unit the weight was given in, only if one was spoken.',
      options: Object.values(WeightUnits),
    },
    steps: {
      label: 'Prep steps',
      type: 'stringList',
      description:
        'Each preparation step as a short phrase in sentence case, one action per step, ' +
        'in the order spoken.',
    },
    notes: NOTES_FIELD,
  }),
  smoke: fields({
    chamberName: {
      label: 'Chamber name',
      type: 'string',
      description: 'What the chamber (pit) probe is to be called, only if it was given a name.',
    },
    probe1Name: probeName(1),
    probe2Name: probeName(2),
    probe3Name: probeName(3),
    woodType: {
      label: 'Wood type',
      type: 'string',
      description: 'The wood being burned, as spoken.',
      suggestions: WOOD_TYPES,
    },
    probeTargets: {
      label: 'Probe target',
      type: 'recordList',
      description: 'Each target temperature that was set for a meat probe, one entry per target.',
      parts: [
        {
          key: 'probe',
          type: 'string',
          description:
            'Which probe the target is for, as it was said: "probe one", "the flat", ' +
            '"both", "all probes".',
        },
        {
          key: 'target',
          type: 'integer',
          description: 'The target temperature in °F ("two oh three" is 203).',
        },
      ],
    },
    serveClock: {
      label: 'Serve time',
      type: 'string',
      description:
        'The time of day the food is to be served, as a clock time, with AM or PM only if ' +
        'it was said ("six thirty" is "6:30", "six thirty tonight" is "6:30 PM"). Left out ' +
        'when no clock time was said ("dinner time", "Saturday").',
    },
    serveTomorrow: {
      label: 'Serve time',
      type: 'boolean',
      description: 'True only when the serve time was said to be tomorrow.',
    },
    serveInMinutes: {
      label: 'Serve time',
      type: 'integer',
      description:
        'How long from now the food is to be served, in minutes, only when it was said as ' +
        'a length of time and not as a clock time ("in four hours" is 240).',
    },
    restMinutes: {
      label: 'Rest duration',
      type: 'integer',
      description:
        'How long the meat is to rest after it comes off, in minutes ("forty-five minutes" ' +
        'is 45, "a couple hours" is 120, "half an hour" is 30). Left out when the length is vague.',
    },
    stamps: {
      label: 'Log now',
      type: 'recordList',
      description:
        'Each thing the cook says they have done that the cook log has a stamp for, one ' +
        'entry per thing. Things they plan to do are left out.',
      parts: [
        {
          key: 'stamp',
          type: 'string',
          description: 'The stamp it is logged under, from the stamps given.',
        },
        {
          key: 'ago',
          type: 'string',
          description:
            'How long ago it was done, as it was said ("an hour ago"), only when it was not ' +
            'done just now.',
        },
      ],
    },
    notes: NOTES_FIELD,
  }),
  postSmoke: fields({
    restMinutes: {
      label: 'Rest time',
      type: 'integer',
      description:
        'How long the meat rested, in minutes ("an hour and fifteen" is 75, ' +
        '"a couple hours" is 120). Left out when the length is vague.',
    },
    steps: {
      label: 'Post-smoke steps',
      type: 'stringList',
      description:
        'Each step taken after the smoke as a short phrase in sentence case, one action ' +
        'per step, in the order spoken.',
    },
    notes: NOTES_FIELD,
  }),
};

/**
 * A key a model returns a value under on a screen. Given no one screen, the
 * keys every screen has.
 */
export type VoiceFillFieldKey<Screen extends VoiceFillScreen = VoiceFillScreen> =
  keyof (typeof FIELDS)[Screen];

/** The definition of the field a model returns under `key` on `screen`. */
export const fieldOf = <Screen extends VoiceFillScreen>(
  screen: Screen,
  key: VoiceFillFieldKey<Screen>
): VoiceFillField => {
  const specs: Record<string, FieldSpec> = FIELDS[screen];
  return { key: String(key), ...specs[String(key)] };
};

/** A screen's fields in the order they are defined, each with its key. */
const listed = (specs: Record<string, FieldSpec>): VoiceFillField[] =>
  Object.keys(specs).map(key => ({ key, ...specs[key] }));

export const SCREEN_FIELDS: Record<VoiceFillScreen, VoiceFillScreenDefinition> = {
  preSmoke: { title: 'Pre-smoke', fields: listed(FIELDS.preSmoke) },
  smoke: { title: 'Smoke', fields: listed(FIELDS.smoke) },
  postSmoke: { title: 'Post-smoke', fields: listed(FIELDS.postSmoke) },
};

/** The schema of one plain value, in the subset every runtime understands. */
export type VoiceFillValueSchema =
  | { type: 'string'; enum?: readonly string[] }
  | { type: 'number' | 'integer' | 'boolean' }
  | { type: 'array'; items: { type: 'string' } | VoiceFillRecordSchema };

type Described<Schema> = Schema & { description: string };

/**
 * The schema of one entry in a list of records. In a JSON Schema every part is
 * required and nullable; as a tool parameter none is either — the same two ways
 * of writing "not said" the fields themselves have.
 */
export interface VoiceFillRecordSchema {
  type: 'object';
  properties: Record<
    string,
    Described<VoiceFillValueSchema | { anyOf: [VoiceFillValueSchema, { type: 'null' }] }>
  >;
  required?: string[];
  additionalProperties?: false;
}

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

/** The two dialects a definition is written out in. */
type Dialect = 'jsonSchema' | 'tool';

/** One entry of a list of records, in the dialect it is asked for in. */
const recordSchemaOf = (
  parts: readonly VoiceFillPart[],
  dialect: Dialect
): VoiceFillRecordSchema => {
  const properties: VoiceFillRecordSchema['properties'] = {};
  parts.forEach(({ key, type, description }) => {
    properties[key] =
      dialect === 'tool'
        ? { description, type }
        : { description, anyOf: [{ type }, { type: 'null' }] };
  });
  return dialect === 'tool'
    ? { type: 'object', properties }
    : {
        type: 'object',
        properties,
        required: parts.map(part => part.key),
        additionalProperties: false,
      };
};

const valueSchemaOf = (field: VoiceFillField, dialect: Dialect): VoiceFillValueSchema => {
  switch (field.type) {
    case 'stringList':
      return { type: 'array', items: { type: 'string' } };
    case 'recordList':
      return { type: 'array', items: recordSchemaOf(field.parts ?? [], dialect) };
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
    const value = valueSchemaOf(field, 'jsonSchema');
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
    properties[field.key] = {
      description: descriptionOf(field),
      ...valueSchemaOf(field, 'tool'),
    };
  });
  return {
    name: `fill_${snakeCase(screen)}`,
    description: `Record the ${title} fields the Ramble mentions. Leave out anything not said.`,
    parameters: { type: 'object', properties },
  };
};
