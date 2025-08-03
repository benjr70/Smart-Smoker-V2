import { SmokeHistory } from './histroyDto';

describe('SmokeHistory DTO', () => {
  it('should create a SmokeHistory instance', () => {
    const smokeHistory = new SmokeHistory();
    expect(smokeHistory).toBeDefined();
  });

  it('should allow setting properties', () => {
    const smokeHistory = new SmokeHistory();
    smokeHistory.name = 'Test Smoke';
    smokeHistory.meatType = 'Beef';
    smokeHistory.weight = '5';
    smokeHistory.weightUnit = 'lbs';
    smokeHistory.woodType = 'Oak';
    smokeHistory.date = '2023-01-01';
    smokeHistory.smokeId = 'test-id';
    smokeHistory.overAllRating = '5';

    expect(smokeHistory.name).toBe('Test Smoke');
    expect(smokeHistory.meatType).toBe('Beef');
    expect(smokeHistory.weight).toBe('5');
    expect(smokeHistory.weightUnit).toBe('lbs');
    expect(smokeHistory.woodType).toBe('Oak');
    expect(smokeHistory.date).toBe('2023-01-01');
    expect(smokeHistory.smokeId).toBe('test-id');
    expect(smokeHistory.overAllRating).toBe('5');
  });
});