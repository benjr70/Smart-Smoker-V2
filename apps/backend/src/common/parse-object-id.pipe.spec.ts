import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ParseObjectIdPipe } from './parse-object-id.pipe';

describe('ParseObjectIdPipe', () => {
  let pipe: ParseObjectIdPipe;

  beforeEach(() => {
    pipe = new ParseObjectIdPipe();
  });

  it('returns the value unchanged for a valid ObjectId', () => {
    const id = new Types.ObjectId().toString();

    expect(pipe.transform(id)).toBe(id);
  });

  it('throws BadRequestException for a malformed id', () => {
    expect(() => pipe.transform('not-an-object-id')).toThrow(
      BadRequestException,
    );
  });
});
