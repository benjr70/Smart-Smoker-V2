import { SmokeDto } from './smokeDto';
import { SmokeStatus } from './smoke.schema';

describe('SmokeDto', () => {
  it('should create a SmokeDto instance', () => {
    const smokeDto = new SmokeDto();
    expect(smokeDto).toBeDefined();
  });

  it('should allow setting properties', () => {
    const smokeDto = new SmokeDto();
    smokeDto.preSmokeId = 'pre-smoke-1';
    smokeDto.tempsId = 'temps-1';
    smokeDto.postSmokeId = 'post-smoke-1';
    smokeDto.smokeProfileId = 'profile-1';
    smokeDto.ratingId = 'rating-1';
    smokeDto.date = new Date('2023-01-01');
    smokeDto.status = SmokeStatus.InProgress;

    expect(smokeDto.preSmokeId).toBe('pre-smoke-1');
    expect(smokeDto.tempsId).toBe('temps-1');
    expect(smokeDto.postSmokeId).toBe('post-smoke-1');
    expect(smokeDto.smokeProfileId).toBe('profile-1');
    expect(smokeDto.ratingId).toBe('rating-1');
    expect(smokeDto.date).toEqual(new Date('2023-01-01'));
    expect(smokeDto.status).toBe(SmokeStatus.InProgress);
  });

  it('should allow setting Complete status', () => {
    const smokeDto = new SmokeDto();
    smokeDto.status = SmokeStatus.Complete;
    expect(smokeDto.status).toBe(SmokeStatus.Complete);
  });
});