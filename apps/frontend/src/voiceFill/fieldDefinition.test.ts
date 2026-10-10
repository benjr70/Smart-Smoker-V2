import { DEFAULT_STAMPS } from '../api/cookStamps';
import { MEAT_TYPES } from '../components/smoke/preSmokeStep/meatTypes';
import { WOOD_TYPES } from '../components/smoke/smokeStep/woodTypes';
import {
  SCREEN_FIELDS,
  VoiceFillScreen,
  fieldOf,
  jsonSchemaFor,
  keyTermsFor,
  toolSchemaFor,
} from '.';

const SCREENS: VoiceFillScreen[] = ['preSmoke', 'smoke', 'postSmoke'];

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

describe('the smoke screen', () => {
  it('asks for the names, the wood, the targets, the Serve Plan, the cook log and Notes', () => {
    expect(SCREEN_FIELDS.smoke.fields.map(field => field.key)).toEqual([
      'chamberName',
      'probe1Name',
      'probe2Name',
      'probe3Name',
      'woodType',
      'probeTargets',
      'serveClock',
      'serveTomorrow',
      'serveInMinutes',
      'restMinutes',
      'stamps',
      'notes',
    ]);
  });

  it('asks the JSON Schema for a list of records whose every part is required and nullable', () => {
    const { probeTargets, serveTomorrow } = jsonSchemaFor('smoke').properties;
    const [probe, target] = fieldOf('smoke', 'probeTargets').parts ?? [];

    expect(probeTargets).toEqual({
      description: fieldOf('smoke', 'probeTargets').description,
      type: 'array',
      items: {
        type: 'object',
        properties: {
          probe: { description: probe.description, anyOf: [{ type: 'string' }, { type: 'null' }] },
          target: {
            description: target.description,
            anyOf: [{ type: 'integer' }, { type: 'null' }],
          },
        },
        required: ['probe', 'target'],
        additionalProperties: false,
      },
    });
    expect(serveTomorrow).toMatchObject({ anyOf: [{ type: 'boolean' }, { type: 'null' }] });
  });

  it('asks the tool for a list of records with nothing required and nothing nullable', () => {
    const tool = toolSchemaFor('smoke');
    const [stamp, ago] = fieldOf('smoke', 'stamps').parts ?? [];

    expect(tool.name).toBe('fill_smoke');
    expect(tool.parameters.properties.stamps).toEqual({
      description: fieldOf('smoke', 'stamps').description,
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stamp: { description: stamp.description, type: 'string' },
          ago: { description: ago.description, type: 'string' },
        },
      },
    });
    expect(tool.parameters.properties.serveTomorrow).toMatchObject({ type: 'boolean' });
  });

  it('gives the model the wood suggestion list the screen offers', () => {
    const suggestions = 'Hickory, Post Oak, Pecan, Cherry, Apple, Mesquite';

    expect(jsonSchemaFor('smoke').properties.woodType.description).toContain(suggestions);
    expect(toolSchemaFor('smoke').parameters.properties.woodType.description).toContain(
      suggestions
    );
  });

  describe('asked with the context of a Ramble', () => {
    const context = {
      now: new Date(2026, 9, 3, 15),
      probeNames: ['Flat', '', ' Point '],
      enabledStamps: [
        ...DEFAULT_STAMPS.map(stamp => ({ ...stamp, enabled: stamp.key !== 'vent' })),
        {
          key: 'custom-01J',
          label: 'Flipped',
          tone: 'amber' as const,
          enabled: true,
          custom: true,
        },
      ],
    };
    const [probe] = fieldOf('smoke', 'probeTargets').parts ?? [];
    const [stamp] = fieldOf('smoke', 'stamps').parts ?? [];
    const probesTold = 'Current probe names: probe 1 is "Flat", probe 3 is "Point".';
    const stampsTold =
      'Stamps: wood ("Added Wood"), wrap ("Wrapped"), spritz ("Spritzed"), lid ("Lid Open"), ' +
      'sauce ("Sauced"), custom-01J ("Flipped").';

    it('carries the current probe names and the enabled stamp keys in the JSON Schema', () => {
      const { probeTargets, stamps } = jsonSchemaFor('smoke', context).properties;

      expect(probeTargets).toMatchObject({
        items: { properties: { probe: { description: `${probe.description} ${probesTold}` } } },
      });
      expect(stamps).toMatchObject({
        items: { properties: { stamp: { description: `${stamp.description} ${stampsTold}` } } },
      });
    });

    it('carries the same in the tool schema', () => {
      const { probeTargets, stamps } = toolSchemaFor('smoke', context).parameters.properties;

      expect(probeTargets).toMatchObject({
        items: { properties: { probe: { description: `${probe.description} ${probesTold}` } } },
      });
      expect(stamps).toMatchObject({
        items: { properties: { stamp: { description: `${stamp.description} ${stampsTold}` } } },
      });
    });

    it('asks as it does with no context when no probe is named and no stamp is offered', () => {
      const bare = { now: context.now, probeNames: ['', '', ''], enabledStamps: [] };

      expect(jsonSchemaFor('smoke', bare)).toEqual(jsonSchemaFor('smoke'));
      expect(toolSchemaFor('smoke', { now: context.now })).toEqual(toolSchemaFor('smoke'));
    });

    it('leaves the other screens as they are', () => {
      expect(jsonSchemaFor('preSmoke', context)).toEqual(jsonSchemaFor('preSmoke'));
      expect(toolSchemaFor('postSmoke', context)).toEqual(toolSchemaFor('postSmoke'));
    });
  });

  it('cannot be asked for a field it does not have', () => {
    // Never called: the line below is here to be refused by the compiler.
    // @ts-expect-error the smoke screen has no step list
    const mistyped = () => fieldOf('smoke', 'steps');

    expect(mistyped).toBeInstanceOf(Function);
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

describe('the key terms of a Ramble', () => {
  it('are the meat suggestions on the pre-smoke screen', () => {
    expect(keyTermsFor('preSmoke')).toEqual([...MEAT_TYPES]);
  });

  it('are the wood suggestions and the probes’ names on the smoke screen', () => {
    expect(keyTermsFor('smoke', { probeNames: ['Flat', 'Point', 'Pork butt'] })).toEqual([
      ...WOOD_TYPES,
      'Flat',
      'Point',
      'Pork butt',
    ]);
  });

  it('leave out a probe nobody named, and give a name two probes share once', () => {
    expect(keyTermsFor('smoke', { probeNames: ['Flat', '', '  ', ' flat '] })).toEqual([
      ...WOOD_TYPES,
      'Flat',
    ]);
  });

  it('are the wood suggestions alone where the smoke screen names no probes', () => {
    expect(keyTermsFor('smoke')).toEqual([...WOOD_TYPES]);
  });

  it('do not take probe names on a screen that has no probes', () => {
    expect(keyTermsFor('preSmoke', { probeNames: ['Flat'] })).toEqual([...MEAT_TYPES]);
  });

  it('are none on the post-smoke screen, which suggests nothing', () => {
    expect(keyTermsFor('postSmoke')).toEqual([]);
  });
});
