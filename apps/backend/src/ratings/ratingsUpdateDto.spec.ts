import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RatingsUpdateDto } from './ratingsUpdateDto';

/**
 * `POST /api/ratings/:id` runs under the global ValidationPipe (whitelist +
 * forbidNonWhitelisted). The frontend re-sends the whole rating it loaded,
 * which carries the persisted `_id`/`__v`; with the plain RatingsDto those
 * extra fields were rejected and the review's re-rating silently 400'd. This
 * DTO permits them so the update validates.
 */
describe('RatingsUpdateDto validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const metadata = { type: 'body' as const, metatype: RatingsUpdateDto };

  it('accepts a rating re-sent with its persisted _id and __v', async () => {
    const body = {
      _id: '507f1f77bcf86cd799439011',
      __v: 0,
      smokeFlavor: 5,
      seasoning: 6,
      tenderness: 7,
      overallTaste: 9,
      notes: 'great',
    };

    const result = await pipe.transform(body, metadata);

    expect(result.overallTaste).toBe(9);
  });

  it('rejects an unknown property', async () => {
    const body = {
      smokeFlavor: 5,
      seasoning: 6,
      tenderness: 7,
      overallTaste: 9,
      notes: '',
      bogus: true,
    };

    await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
