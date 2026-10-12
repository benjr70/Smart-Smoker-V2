import { DEFAULT_STAMPS } from '../api/cookStamps';
import { jsonSchemaFor } from './fieldDefinition';
import type { ExtractionContext } from './ports';
import type { ConstrainedRequest, JsonGenerator } from './transformersExtractor';
import { createJsonExtractor, enforceableSchema, rawObjectIn } from './transformersExtractor';

const TRANSCRIPT = 'Sixteen pound brisket. Trimmed the fat cap.';

const context: ExtractionContext = {
  now: new Date(2026, 9, 3, 15, 5),
  probeNames: ['Flat', '', 'Point'],
  enabledStamps: DEFAULT_STAMPS,
};

/** A model that answers every Ramble with `answer`, and says what it was asked. */
const model = (answer = '{}') => {
  const generator: JsonGenerator & { generate: jest.Mock; dispose: jest.Mock } = {
    generate: jest.fn(() => Promise.resolve(answer)),
    dispose: jest.fn(() => Promise.resolve()),
  };
  const load = jest.fn(() => Promise.resolve<JsonGenerator>(generator));
  const asked = (): ConstrainedRequest => generator.generate.mock.calls[0][0];
  return { generator, load, asked };
};

describe('an extraction model that answers in JSON', () => {
  it.each(['preSmoke', 'smoke', 'postSmoke'] as const)(
    'has its answer held to the JSON Schema derived from the %s screen’s field definition',
    async screen => {
      const { load, asked } = model();

      await createJsonExtractor(load).extract(screen, TRANSCRIPT, context);

      expect(asked().schema).toEqual(enforceableSchema(jsonSchemaFor(screen, context)));
      // The model is told the schema as the field definition gives it.
      expect(asked().system).toContain(JSON.stringify(jsonSchemaFor(screen, context)));
    }
  );

  it('is given the Ramble, and answers it with one call to the model', async () => {
    const { generator, load, asked } = model('{"weight":16,"weightUnit":"LB"}');

    const raw = await createJsonExtractor(load).extract('preSmoke', TRANSCRIPT, context);

    expect(generator.generate).toHaveBeenCalledTimes(1);
    expect(asked().user).toContain(TRANSCRIPT);
    expect(raw).toEqual({ weight: 16, weightUnit: 'LB' });
  });

  it('leaves out what the model wrote null for: what the cook did not say', async () => {
    const { load } = model(
      JSON.stringify({
        name: null,
        weight: 16,
        steps: [],
        probeTargets: [{ probe: 1, target: 203, leadMinutes: null }],
        notes: null,
      })
    );

    expect(await createJsonExtractor(load).extract('preSmoke', TRANSCRIPT, context)).toEqual({
      weight: 16,
      steps: [],
      probeTargets: [{ probe: 1, target: 203 }],
    });
  });

  it('fails on an answer that is not one JSON object, asking nothing a second time', async () => {
    const { generator, load } = model('The brisket weighs sixteen pounds.');

    await expect(
      createJsonExtractor(load).extract('preSmoke', TRANSCRIPT, context)
    ).rejects.toThrow('did not answer with JSON');
    expect(generator.generate).toHaveBeenCalledTimes(1);
  });

  it('loads the model once, and again only after a load that failed', async () => {
    const { generator } = model();
    const load = jest
      .fn<Promise<JsonGenerator>, []>()
      .mockRejectedValueOnce(new Error('no GPU'))
      .mockResolvedValue(generator);
    const extractor = createJsonExtractor(load);

    await expect(extractor.load()).rejects.toThrow('no GPU');
    await extractor.load();
    await extractor.extract('smoke', TRANSCRIPT, context);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('lets the model go when it is unloaded, and loads it again after', async () => {
    const { generator, load } = model();
    const extractor = createJsonExtractor(load);

    await extractor.load();
    await extractor.unload();
    expect(generator.dispose).toHaveBeenCalledTimes(1);

    await extractor.load();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('has nothing to let go of when it was never loaded', async () => {
    const { load } = model();

    await createJsonExtractor(load).unload();

    expect(load).not.toHaveBeenCalled();
  });
});

describe('the raw object in a model’s answer', () => {
  it('is the answer’s JSON object', () => {
    expect(rawObjectIn(' {"restMinutes": 45} ')).toEqual({ restMinutes: 45 });
  });

  it('is what follows the thinking of a model that thinks aloud', () => {
    expect(rawObjectIn('<think>\nForty-five, they said.\n</think>\n{"restMinutes":45}')).toEqual({
      restMinutes: 45,
    });
  });

  it.each(['[1, 2]', '"brisket"', 'null', '42'])('is not %s: JSON, but no object', answer => {
    expect(() => rawObjectIn(answer)).toThrow('one JSON object');
  });

  it('is not an answer cut off before its object was closed', () => {
    expect(() => rawObjectIn('{"restMinutes": 4')).toThrow('did not answer with JSON');
  });
});

describe('the schema an answer is held to', () => {
  const nullableOption = {
    description: 'The unit the weight was given in.',
    anyOf: [{ type: 'string', enum: ['LB', 'OZ', 'KG'] }, { type: 'null' }],
  };

  it('lists “not said” among a field’s options, where the runtime holds an answer to them', () => {
    // The runtime lets anything be written for options that are one side of a
    // choice; options with null among them are the same field, and are held.
    expect(enforceableSchema(nullableOption)).toEqual({
      description: 'The unit the weight was given in.',
      enum: ['LB', 'OZ', 'KG', null],
    });
  });

  it('is the field definition’s schema in every other part', () => {
    const schema = jsonSchemaFor('smoke', context);
    const held = enforceableSchema(schema) as typeof schema;

    expect(Object.keys(held.properties)).toEqual(Object.keys(schema.properties));
    expect(held.required).toEqual(schema.required);
    expect(held.additionalProperties).toBe(false);
    expect(held.properties.probeTargets).toEqual(schema.properties.probeTargets);
    expect(held.properties.notes).toEqual(schema.properties.notes);
  });

  it.each(['preSmoke', 'smoke', 'postSmoke'] as const)(
    'leaves no options of the %s screen as one side of a choice',
    screen => {
      const held = JSON.stringify(enforceableSchema(jsonSchemaFor(screen, context)));

      expect(held).not.toMatch(/"anyOf":\[\{[^{}]*"enum"/);
    }
  );

  it('holds the pre-smoke weight unit to the units the screen offers, or to not said', () => {
    const held = enforceableSchema(jsonSchemaFor('preSmoke', context)) as {
      properties: Record<string, { enum?: unknown[] }>;
    };

    expect(held.properties.weightUnit.enum).toEqual(['LB', 'OZ', 'KG', null]);
  });

  it('changes nothing of the schema it is given', () => {
    const before = JSON.stringify(nullableOption);

    enforceableSchema(nullableOption);

    expect(JSON.stringify(nullableOption)).toBe(before);
  });
});
