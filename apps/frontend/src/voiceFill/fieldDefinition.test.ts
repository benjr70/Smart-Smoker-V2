import { SCREEN_FIELDS, VoiceFillScreen, fieldOf, jsonSchemaFor, toolSchemaFor } from '.';

const SCREENS: VoiceFillScreen[] = ['preSmoke', 'postSmoke'];

describe('a field asked for by its key', () => {
  it('is the one the screen lists under that key', () => {
    expect(fieldOf('postSmoke', 'restMinutes')).toEqual(SCREEN_FIELDS.postSmoke.fields[0]);
    expect(fieldOf('preSmoke', 'weightUnit')).toMatchObject({ key: 'weightUnit', label: 'Unit' });
  });

  it('cannot be asked for by a key its screen does not have', () => {
    // Never called: the line below is here to be refused by the compiler.
    // @ts-expect-error the pre-smoke screen has no rest field
    const mistyped = () => fieldOf('preSmoke', 'restMinutes');

    expect(mistyped).toBeInstanceOf(Function);
  });
});

describe('the JSON Schema derived from a screen', () => {
  it('asks for every field of the post-smoke screen, each one nullable', () => {
    const { fields } = SCREEN_FIELDS.postSmoke;
    const description = (key: string) => fields.find(field => field.key === key)?.description;

    expect(jsonSchemaFor('postSmoke')).toEqual({
      type: 'object',
      properties: {
        restMinutes: {
          description: description('restMinutes'),
          anyOf: [{ type: 'integer' }, { type: 'null' }],
        },
        steps: {
          description: description('steps'),
          type: 'array',
          items: { type: 'string' },
        },
        notes: {
          description: description('notes'),
          anyOf: [{ type: 'string' }, { type: 'null' }],
        },
      },
      required: ['restMinutes', 'steps', 'notes'],
      additionalProperties: false,
    });
  });
});

describe('the tool schema derived from a screen', () => {
  it('declares one tool whose parameters are the pre-smoke fields, none of them required', () => {
    const tool = toolSchemaFor('preSmoke');

    expect(tool.name).toBe('fill_pre_smoke');
    expect(tool.parameters).toMatchObject({
      type: 'object',
      properties: {
        name: { type: 'string' },
        meatType: { type: 'string' },
        weight: { type: 'number' },
        weightUnit: { type: 'string', enum: ['LB', 'OZ', 'KG'] },
        steps: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
    });
    expect(tool.parameters).not.toHaveProperty('required');
  });
});

describe('both schemas', () => {
  it.each(SCREENS)('carry the %s definition field for field', screen => {
    const keys = SCREEN_FIELDS[screen].fields.map(field => field.key);
    const json = jsonSchemaFor(screen).properties;
    const tool = toolSchemaFor(screen).parameters.properties;

    expect(Object.keys(json)).toEqual(keys);
    expect(Object.keys(tool)).toEqual(keys);
    keys.forEach(key => expect(tool[key].description).toBe(json[key].description));
  });

  it('give the model the meat suggestion list the screen offers', () => {
    const suggestions = 'Brisket, Ribs, Pork Shoulder, Turkey, Chicken, Chuck Roast, Other';

    expect(jsonSchemaFor('preSmoke').properties.meatType.description).toContain(suggestions);
    expect(toolSchemaFor('preSmoke').parameters.properties.meatType.description).toContain(
      suggestions
    );
  });
});
