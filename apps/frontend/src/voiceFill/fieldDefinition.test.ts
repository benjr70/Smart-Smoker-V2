import { SCREEN_FIELDS, VoiceFillScreen, jsonSchemaFor, toolSchemaFor } from '.';

const SCREENS: VoiceFillScreen[] = ['preSmoke', 'postSmoke'];

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
