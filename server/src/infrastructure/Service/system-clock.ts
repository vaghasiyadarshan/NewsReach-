import type { Clock } from '../../application/port/clock.ts';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
