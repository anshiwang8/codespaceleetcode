import { describe, expect, it } from "vitest";
import { activityLevel, calendarLayout, describeDay } from "@/lib/activity";
import { buildActivity, resolvePeriod } from "@/lib/server/profile";

const days = (key: "rolling" | `${number}`, today: string, historyStart = "2000-01-01") =>
  buildActivity(resolvePeriod(key, today), today, historyStart, []).days;

describe("calendar layout", () => {
  it("puts each date on its weekday row, Sunday first, with padding that isn't a date", () => {
    // 2025-01-01 was a Wednesday: three padding slots come first.
    const { weeks } = calendarLayout(days("2025", "2026-11-06"));
    expect(weeks[0]?.slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0]?.[3]?.date).toBe("2025-01-01");
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    const flat = weeks.flat().filter((day) => day !== null);
    expect(flat).toHaveLength(365);
    // 2025-12-31 was a Wednesday too; the rest of that column is padding.
    expect(weeks.at(-1)?.[3]?.date).toBe("2025-12-31");
    expect(weeks.at(-1)?.slice(4)).toEqual([null, null, null]);
    expect(weeks).toHaveLength(53);
  });

  it("keeps a leap year's 366 dates in order, with Feb 29 on its weekday", () => {
    const { weeks } = calendarLayout(days("2024", "2026-11-06"));
    const flat = weeks.flat().filter((day) => day !== null);
    expect(flat).toHaveLength(366);
    const column = weeks.findIndex((week) => week.some((day) => day?.date === "2024-02-29"));
    // 2024-02-29 was a Thursday.
    expect(weeks[column]?.[4]?.date).toBe("2024-02-29");
  });

  it("names each month over the column holding its 1st, and avoids crowding the first label", () => {
    const { weeks, months } = calendarLayout(days("2025", "2026-11-06"));
    expect(months.map((month) => month.label)).toEqual([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]);
    for (const month of months) {
      expect(weeks[month.week]?.some((day) => day?.date.endsWith("-01"))).toBe(true);
    }
    // The rolling period starting 2025-11-07 opens mid-month: November is named on column 0,
    // because December starts more than two columns later.
    const rolling = calendarLayout(days("rolling", "2026-11-06"));
    expect(rolling.months[0]).toEqual({ week: 0, label: "Nov" });
    expect(rolling.months[1]?.label).toBe("Dec");
    // Starting 2026-10-29, November begins in the very next column, so the first column gets no
    // October label that would run into it.
    const late = calendarLayout(days("rolling", "2027-10-28"));
    expect(late.months.filter((month) => month.week === 0)).toEqual([]);
    expect(late.months[0]).toEqual({ week: 1, label: "Nov" });
  });

  it("ends the rolling period on today, without future dates", () => {
    const list = days("rolling", "2026-11-06");
    expect(list.at(-1)?.date).toBe("2026-11-06");
    expect(list.every((day) => day.date <= "2026-11-06")).toBe(true);
  });
});

describe("intensity and wording", () => {
  it("uses the fixed thresholds 0, 1, 2–3, 4–6 and 7 or more", () => {
    expect([0, 1, 2, 3, 4, 6, 7, 40].map(activityLevel)).toEqual([0, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("describes a date in full, says so for zero, and never calls unavailable dates missed", () => {
    const today = "2026-11-06";
    expect(describeDay({ date: "2026-11-06", submissions: 3, passed: 1, available: true }, today)).toBe(
      "November 6, 2026 (today): 3 submissions, 1 correct.",
    );
    expect(describeDay({ date: "2026-11-05", submissions: 1, passed: 0, available: true }, today)).toBe(
      "November 5, 2026: 1 submission, 0 correct.",
    );
    expect(describeDay({ date: "2026-11-04", submissions: 0, passed: 0, available: true }, today)).toBe(
      "November 4, 2026: no submissions.",
    );
    expect(describeDay({ date: "2026-11-07", submissions: 0, passed: 0, available: false }, today)).toBe(
      "November 7, 2026: in the future.",
    );
    expect(describeDay({ date: "2026-01-02", submissions: 0, passed: 0, available: false }, today)).toBe(
      "January 2, 2026: before your history starts.",
    );
  });
});
