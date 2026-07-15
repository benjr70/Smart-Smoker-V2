import {
  GOLDEN_BATCH_DTO,
  GOLDEN_DATE,
  GOLDEN_EVENTS_FRAME,
  GOLDEN_EVENTS_PAYLOAD,
  GOLDEN_EVENTS_SNAPSHOT,
  GOLDEN_PROBE_READING,
  GOLDEN_SERIAL_FRAME,
  GOLDEN_SMOKE_UPDATE,
  WireDecodeError,
  buildSmokeUpdate,
  decodeEvents,
  decodeSerialReading,
  encodeEvents,
  toBatchDto,
} from '../index';

describe('decodeSerialReading', () => {
  it('maps Meat/Meat2/Meat3/Chamber to probe fields with the injected timestamp', () => {
    // Behavior 2: the frozen serial frame decodes to the golden probe reading.
    const reading = decodeSerialReading(GOLDEN_SERIAL_FRAME, GOLDEN_DATE);

    expect(reading).toEqual(GOLDEN_PROBE_READING);
  });

  it('rejects a malformed (non-JSON) frame deterministically', () => {
    // Behavior 3: not valid JSON -> throw, never a partial reading.
    expect(() => decodeSerialReading('{"Meat": "120.4"', GOLDEN_DATE)).toThrow(WireDecodeError);
  });

  it('rejects a well-formed frame missing a temperature field rather than returning a partial reading', () => {
    // Behavior 3: valid JSON but Chamber absent -> throw.
    const frame = '{"Meat": "120.4","Meat2": "119.8","Meat3": "118.2"}';

    expect(() => decodeSerialReading(frame, GOLDEN_DATE)).toThrow(WireDecodeError);
  });
});

describe('encodeEvents', () => {
  it('produces the exact frozen events JSON string with string temps and the shipped field order', () => {
    // Behavior 1: byte-level pin of the encoded events payload.
    const payload = encodeEvents(GOLDEN_EVENTS_SNAPSHOT);

    expect(payload).toBe(GOLDEN_EVENTS_PAYLOAD);
  });

  it('serializes events as a JSON string, not an object', () => {
    // The events envelope is a string on the wire (contrast with smokeUpdate).
    expect(typeof encodeEvents(GOLDEN_EVENTS_SNAPSHOT)).toBe('string');
  });
});

describe('buildSmokeUpdate', () => {
  it('yields exactly the five frozen fields as a plain object (not a JSON string)', () => {
    // Behavior 4: object envelope with exactly the five frozen fields.
    const update = buildSmokeUpdate(GOLDEN_SMOKE_UPDATE);

    expect(typeof update).toBe('object');
    expect(update).toEqual(GOLDEN_SMOKE_UPDATE);
    expect(Object.keys(update)).toEqual([
      'smoking',
      'chamberName',
      'probe1Name',
      'probe2Name',
      'probe3Name',
    ]);
  });

  it('drops any extra fields the caller passes so a sixth field can never leak onto the wire', () => {
    const update = buildSmokeUpdate({
      ...GOLDEN_SMOKE_UPDATE,
      // Extra property that must not survive.
      probeTemp1: '999',
    } as Parameters<typeof buildSmokeUpdate>[0]);

    expect(Object.keys(update)).toEqual([
      'smoking',
      'chamberName',
      'probe1Name',
      'probe2Name',
      'probe3Name',
    ]);
  });
});

describe('toBatchDto', () => {
  it('maps a probe reading to the numeric batch DTO via float parsing, preserving the date', () => {
    // Behavior 5: numeric batch shape with the shipped field order and names.
    const dto = toBatchDto(GOLDEN_PROBE_READING);

    expect(dto).toEqual(GOLDEN_BATCH_DTO);
    expect(Object.keys(dto)).toEqual(['ChamberTemp', 'MeatTemp', 'Meat2Temp', 'Meat3Temp', 'date']);
    // Temps are real numbers, not strings.
    expect(typeof dto.ChamberTemp).toBe('number');
    expect(typeof dto.MeatTemp).toBe('number');
  });
});

describe('decodeEvents', () => {
  it('round-trips what encodeEvents produced (date lands as the ISO string on the wire)', () => {
    // Behavior 6 (nice-to-have): decode(encode(x)) equals the golden wire frame.
    const decoded = decodeEvents(encodeEvents(GOLDEN_EVENTS_SNAPSHOT));

    expect(decoded).toEqual(GOLDEN_EVENTS_FRAME);
  });

  it('decodes the golden events payload to the golden wire frame', () => {
    expect(decodeEvents(GOLDEN_EVENTS_PAYLOAD)).toEqual(GOLDEN_EVENTS_FRAME);
  });

  it('rejects a malformed events payload deterministically', () => {
    expect(() => decodeEvents('{"chamberName":')).toThrow(WireDecodeError);
  });
});
