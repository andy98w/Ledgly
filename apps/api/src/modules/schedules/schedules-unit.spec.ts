import { SchedulesService } from './schedules.service';

describe('SchedulesService.calculateNextRun', () => {
  let service: SchedulesService;

  beforeEach(() => {
    // Create service with null prisma since we only test calculateNextRun
    service = new SchedulesService(null as any);
  });

  describe('MONTHLY', () => {
    it('returns this month if day is in the future', () => {
      const now = new Date();
      // Use day 28 which is always in the future unless it's the 28th
      const result = service.calculateNextRun('MONTHLY', 28);
      expect(result.getDate()).toBe(28);
      expect(result >= now || result.getMonth() === now.getMonth() + 1).toBe(true);
    });

    it('returns next month if day has passed', () => {
      const result = service.calculateNextRun('MONTHLY', 1);
      const now = new Date();
      // Day 1 has already passed (unless it's the 1st before noon)
      if (now.getDate() > 1) {
        expect(result.getMonth()).toBe((now.getMonth() + 1) % 12);
      }
      expect(result.getDate()).toBe(1);
    });

    it('sets time to noon', () => {
      const result = service.calculateNextRun('MONTHLY', 15);
      expect(result.getHours()).toBe(12);
      expect(result.getMinutes()).toBe(0);
    });
  });

  describe('QUARTERLY', () => {
    it('returns a date in a quarter start month', () => {
      const result = service.calculateNextRun('QUARTERLY', 15);
      const quarterMonths = [0, 3, 6, 9];
      expect(quarterMonths).toContain(result.getMonth());
      expect(result.getDate()).toBe(15);
    });

    it('returns a future date', () => {
      const now = new Date();
      const result = service.calculateNextRun('QUARTERLY', 1);
      expect(result > now).toBe(true);
    });
  });

  describe('YEARLY', () => {
    it('uses monthOfYear correctly', () => {
      const result = service.calculateNextRun('YEARLY', 15, 6); // June 15
      expect(result.getMonth()).toBe(5); // 0-indexed: June = 5
      expect(result.getDate()).toBe(15);
    });

    it('defaults to January if no monthOfYear', () => {
      const result = service.calculateNextRun('YEARLY', 10);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(10);
    });

    it('advances to next year if date has passed', () => {
      const now = new Date();
      // Use January 1, which has already passed
      const result = service.calculateNextRun('YEARLY', 1, 1);
      if (now.getMonth() > 0 || now.getDate() > 1) {
        expect(result.getFullYear()).toBe(now.getFullYear() + 1);
      }
    });
  });
});
