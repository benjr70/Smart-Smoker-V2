/**
 * The extractor port over a model that answers with one JSON object, held to
 * the JSON Schema of the screen's fields as it writes.
 *
 * The schema is the one derived from the per-screen field definition, written
 * the way this runtime enforces it (see {@link enforceableSchema}).
 *
 * A constrained decoder writes every key of the schema, so what the cook did
 * not say comes back as `null`. The port's raw object leaves out what was not
 * said, so the nulls are taken out here, before the extraction contract sees
 * any of it.
 *
 * The model is behind {@link JsonGenerator}, which says only as much of it as
 * is used here. Nothing in this module imports a runtime, so all of it is run
 * in tests.
 */
import type { JsonExtractionRequest } from './extractionRequest';
import { jsonExtractionRequestFor } from './extractionRequest';
import type { ExtractorPort } from './ports';

/** What a loaded model is asked: the Ramble, and the schema its answer is held to. */
export interface ConstrainedRequest extends Omit<JsonExtractionRequest, 'schema'> {
  /** The screen's fields, as the runtime holds an answer to them. */
  schema: object;
}

/** An extraction model, loaded. */
export interface JsonGenerator {
  /**
   * Everything the model writes in answer to `request`, with what it writes
   * held to `request.schema`.
   */
  generate(request: ConstrainedRequest): Promise<string>;
  /** Lets the model go, and the memory it holds with it. */
  dispose(): Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The options of a schema that is a choice between some strings and `null`. */
const nullableOptions = (schema: Record<string, unknown>): unknown[] | undefined => {
  const sides = schema.anyOf;
  if (!Array.isArray(sides) || sides.length !== 2) {
    return undefined;
  }
  const [options, nothing] = sides;
  return isRecord(options) &&
    Array.isArray(options.enum) &&
    isRecord(nothing) &&
    nothing.type === 'null'
    ? options.enum
    : undefined;
};

/**
 * `schema` as Transformers.js holds an answer to it: the same schema, with
 * "not said" listed among a field's options instead of beside them.
 *
 * The field definition writes a field with options as a choice between those
 * options and `null`. What holds an answer to a schema in this runtime holds
 * nothing to options that are one side of a choice — the model may write any
 * text there — but does hold it to options listed outright, `null` among them.
 * The two say the same of an answer; only the second is enforced.
 */
export const enforceableSchema = (schema: unknown): unknown => {
  if (Array.isArray(schema)) {
    return schema.map(enforceableSchema);
  }
  if (!isRecord(schema)) {
    return schema;
  }
  const options = nullableOptions(schema);
  if (options) {
    const rest = Object.entries(schema).filter(([key]) => key !== 'anyOf');
    return { ...Object.fromEntries(rest), enum: [...options, null] };
  }
  return Object.fromEntries(
    Object.entries(schema).map(([key, part]) => [key, enforceableSchema(part)])
  );
};

/** `value` with every part that is `null` left out, however deep it is. */
const withoutNulls = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.filter(entry => entry !== null).map(withoutNulls);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, part]) => part !== null)
        .map(([key, part]) => [key, withoutNulls(part)])
    );
  }
  return value;
};

/**
 * The raw object `answer` is: its one JSON object, with what was not said
 * left out.
 *
 * Throws unless the answer is exactly that. A model that thinks aloud before
 * it answers does so between `<think>` tags, which are not part of the answer.
 */
export const rawObjectIn = (answer: string): Record<string, unknown> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim());
  } catch {
    throw new Error('The model did not answer with JSON.');
  }
  if (!isRecord(parsed)) {
    throw new Error('The model did not answer with one JSON object.');
  }
  return withoutNulls(parsed) as Record<string, unknown>;
};

/** An extractor that reads a Ramble with the model `loadGenerator` loads. */
export const createJsonExtractor = (loadGenerator: () => Promise<JsonGenerator>): ExtractorPort => {
  // The model as it is loading or loaded; nothing once it has been let go.
  let loaded: Promise<JsonGenerator> | undefined;
  const generator = (): Promise<JsonGenerator> => {
    if (!loaded) {
      const loading = loadGenerator();
      loaded = loading;
      // A load that failed is tried again by the next thing that asks.
      loading.catch(() => {
        if (loaded === loading) {
          loaded = undefined;
        }
      });
    }
    return loaded;
  };
  return {
    load: () => generator().then(() => undefined),
    extract: async (screen, transcript, context) => {
      const request = jsonExtractionRequestFor(screen, transcript, context);
      const model = await generator();
      // The one answer this Ramble gets: one that is not the JSON object is a
      // failure, and is not asked for again unconstrained.
      return rawObjectIn(
        await model.generate({ ...request, schema: enforceableSchema(request.schema) as object })
      );
    },
    unload: async () => {
      const loading = loaded;
      loaded = undefined;
      // One that never loaded holds nothing to let go of.
      const held = await loading?.catch(() => undefined);
      await held?.dispose();
    },
  };
};
