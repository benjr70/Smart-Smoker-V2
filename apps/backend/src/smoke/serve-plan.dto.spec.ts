import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ServePlanDto } from './serve-plan.dto';

/**
 * What the planner card is allowed to send. The pipe this runs under
 * transforms and whitelists, so what survives here is exactly what reaches the
 * cook document.
 */
describe('ServePlanDto', () => {
  it('takes a serve time as an ISO string and a rest in whole minutes', async () => {
    const dto = plainToInstance(ServePlanDto, {
      serveAt: '2026-08-30T18:00:00.000Z',
      restMinutes: 45,
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.serveAt).toEqual(new Date('2026-08-30T18:00:00.000Z'));
  });

  it('takes either half of the plan on its own', async () => {
    expect(
      await validate(plainToInstance(ServePlanDto, { restMinutes: 0 })),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(ServePlanDto, { serveAt: '2026-08-30T18:00:00.000Z' }),
      ),
    ).toHaveLength(0);
  });

  /** How a pitmaster who has abandoned the plan says so. */
  it('takes either half sent as nothing, which clears it', async () => {
    expect(
      await validate(
        plainToInstance(ServePlanDto, { serveAt: null, restMinutes: null }),
      ),
    ).toHaveLength(0);
  });

  it('refuses a rest that would put the pull after the serve', async () => {
    const errors = await validate(
      plainToInstance(ServePlanDto, { restMinutes: -15 }),
    );

    expect(errors.some((error) => error.property === 'restMinutes')).toBe(true);
  });

  it('refuses a rest measured in anything but whole minutes', async () => {
    const errors = await validate(
      plainToInstance(ServePlanDto, { restMinutes: 45.5 }),
    );

    expect(errors.some((error) => error.property === 'restMinutes')).toBe(true);
  });

  it('refuses a serve time that is not a date', async () => {
    const errors = await validate(
      plainToInstance(ServePlanDto, { serveAt: 'dinner time' }),
    );

    expect(errors.some((error) => error.property === 'serveAt')).toBe(true);
  });
});
