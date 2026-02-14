import { Injectable } from "@nestjs/common";
import { DateTime, Interval, Settings } from "luxon";
import type { RecurringAvailability, AvailabilityOverride, Booking } from "@prisma/client";

Settings.throwOnInvalid = true;

export interface SlotResult {
  startTime: string;
  endTime: string;
  score: number;
}

export interface SlotPreferences {
  timeOfDay?: "morning" | "afternoon" | "evening";
  preferredDays?: number[];
  notBefore?: string;
  notAfter?: string;
}

@Injectable()
export class AvailabilityCalculatorService {
  calculateSlots(
    recurring: RecurringAvailability[],
    overrides: AvailabilityOverride[],
    bookings: Booking[],
    timezone: string,
    bufferMinutes: number,
    startDate: string,
    endDate: string,
    durationMinutes: number,
    preferences: SlotPreferences = {},
    maxResults: number = 10,
  ): SlotResult[] {
    const rangeStart = DateTime.fromISO(startDate, { zone: timezone }).startOf(
      "day",
    );
    const rangeEnd = DateTime.fromISO(endDate, { zone: timezone }).endOf("day");

    // 1. Build daily windows from recurring availability
    let windows = this.buildDailyWindows(
      recurring,
      timezone,
      rangeStart,
      rangeEnd,
    );

    // 2. Apply overrides (BLOCK subtracts, OPEN adds)
    windows = this.applyOverrides(windows, overrides);

    // 3. Subtract bookings with buffer
    windows = this.subtractBookings(windows, bookings, bufferMinutes);

    // 4. Generate slots
    const minimumStart = DateTime.now().plus({ hours: 1 });
    const slots = this.generateSlots(windows, durationMinutes, minimumStart);

    // 5. Score and rank
    const scored = slots.map((slot) => ({
      ...slot,
      score: this.scoreSlot(slot, preferences),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, maxResults);
  }

  private buildDailyWindows(
    recurring: RecurringAvailability[],
    _timezone: string,
    rangeStart: DateTime,
    rangeEnd: DateTime,
  ): Interval[] {
    const windows: Interval[] = [];
    const activeRules = recurring.filter((r) => r.isActive);

    let current = rangeStart;
    while (current <= rangeEnd) {
      const dayOfWeek = current.weekday % 7; // Luxon: 1=Mon..7=Sun → 0=Sun..6=Sat

      const dayRules = activeRules.filter((r) => r.dayOfWeek === dayOfWeek);
      for (const rule of dayRules) {
        const [startHour, startMin] = rule.startTime.split(":").map(Number);
        const [endHour, endMin] = rule.endTime.split(":").map(Number);

        const start = current.set({
          hour: startHour,
          minute: startMin,
          second: 0,
          millisecond: 0,
        });
        const end = current.set({
          hour: endHour,
          minute: endMin,
          second: 0,
          millisecond: 0,
        });

        if (end > start) {
          const interval = Interval.fromDateTimes(start, end);
          if (interval.isValid) {
            windows.push(interval);
          }
        }
      }

      current = current.plus({ days: 1 });
    }

    return windows;
  }

  private applyOverrides(
    windows: Interval[],
    overrides: AvailabilityOverride[],
  ): Interval[] {
    let result = [...windows];

    for (const override of overrides) {
      const overrideInterval = Interval.fromDateTimes(
        DateTime.fromJSDate(override.startTime),
        DateTime.fromJSDate(override.endTime),
      );

      if (!overrideInterval.isValid) continue;

      if (override.type === "BLOCK") {
        result = result.flatMap((w) => this.subtractInterval(w, overrideInterval));
      } else {
        // OPEN — add as new window
        result.push(overrideInterval);
      }
    }

    return result;
  }

  private subtractBookings(
    windows: Interval[],
    bookings: Booking[],
    bufferMinutes: number,
  ): Interval[] {
    let result = [...windows];

    for (const booking of bookings) {
      if (booking.status === "CANCELLED") continue;

      const busyStart = DateTime.fromJSDate(booking.startTime).minus({
        minutes: bufferMinutes,
      });
      const busyEnd = DateTime.fromJSDate(booking.endTime).plus({
        minutes: bufferMinutes,
      });
      const busyInterval = Interval.fromDateTimes(busyStart, busyEnd);

      if (!busyInterval.isValid) continue;

      result = result.flatMap((w) => this.subtractInterval(w, busyInterval));
    }

    return result;
  }

  private subtractInterval(
    window: Interval,
    block: Interval,
  ): Interval[] {
    if (!window.overlaps(block)) {
      return [window];
    }

    const results: Interval[] = [];

    // Left remainder: window.start to block.start
    if (window.start! < block.start!) {
      const left = Interval.fromDateTimes(window.start!, block.start!);
      if (left.isValid && left.length("minutes") > 0) {
        results.push(left);
      }
    }

    // Right remainder: block.end to window.end
    if (block.end! < window.end!) {
      const right = Interval.fromDateTimes(block.end!, window.end!);
      if (right.isValid && right.length("minutes") > 0) {
        results.push(right);
      }
    }

    return results;
  }

  private generateSlots(
    windows: Interval[],
    durationMinutes: number,
    minimumStart: DateTime,
  ): { startTime: string; endTime: string }[] {
    const slots: { startTime: string; endTime: string }[] = [];
    const stepMinutes = 15;

    for (const window of windows) {
      let slotStart = window.start!;

      // Skip past minimum start time
      if (slotStart < minimumStart) {
        // Round up to next 15-min increment after minimumStart
        const diff = minimumStart.diff(slotStart, "minutes").minutes;
        const stepsToSkip = Math.ceil(diff / stepMinutes);
        slotStart = slotStart.plus({ minutes: stepsToSkip * stepMinutes });
      }

      while (slotStart.plus({ minutes: durationMinutes }) <= window.end!) {
        const slotEnd = slotStart.plus({ minutes: durationMinutes });
        slots.push({
          startTime: slotStart.toUTC().toISO()!,
          endTime: slotEnd.toUTC().toISO()!,
        });
        slotStart = slotStart.plus({ minutes: stepMinutes });
      }
    }

    return slots;
  }

  private scoreSlot(
    slot: { startTime: string; endTime: string },
    preferences: SlotPreferences,
  ): number {
    let score = 0;
    const start = DateTime.fromISO(slot.startTime);
    const hour = start.hour;

    // Time-of-day match (30pts)
    if (preferences.timeOfDay) {
      const ranges: Record<string, [number, number]> = {
        morning: [9, 12],
        afternoon: [12, 17],
        evening: [17, 20],
      };
      const [rangeStart, rangeEnd] = ranges[preferences.timeOfDay]!;
      if (hour >= rangeStart && hour < rangeEnd) {
        score += 30;
      }
    }

    // Preferred day match (25pts)
    if (preferences.preferredDays?.length) {
      const dayOfWeek = start.weekday % 7;
      if (preferences.preferredDays.includes(dayOfWeek)) {
        score += 25;
      }
    }

    // Earliness — sooner slots rank higher (20pts max)
    const hoursFromNow = start.diff(DateTime.now(), "hours").hours;
    if (hoursFromNow > 0) {
      score += Math.max(0, 20 - Math.floor(hoursFromNow / 24));
    }

    // Constraint compliance (15pts)
    if (preferences.notBefore) {
      const notBefore = DateTime.fromISO(preferences.notBefore);
      if (start >= notBefore) score += 7;
    } else {
      score += 7;
    }
    if (preferences.notAfter) {
      const notAfter = DateTime.fromISO(preferences.notAfter);
      if (start <= notAfter) score += 8;
    } else {
      score += 8;
    }

    return score;
  }
}
