import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Validates a path/route parameter is a well-formed Mongo ObjectId.
 * A malformed id becomes a `400 Bad Request` at the edge instead of
 * surfacing as a Mongoose `CastError` / opaque `500` deeper in the stack.
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid id: ${value}`);
    }
    return value;
  }
}
