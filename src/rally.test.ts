import { describe, expect, it } from "vitest";
import {
  computeLaunchPlan,
  formatClock,
  formatDuration,
  parseDuration,
  type March,
} from "./rally";

describe("parseDuration", () => {
  it("parses plain seconds", () => {
    expect(parseDuration("45")).toBe(45);
  });

  it("parses mm:ss", () => {
    expect(parseDuration("3:30")).toBe(210);
  });

  it("parses h:mm:ss", () => {
    expect(parseDuration("1:02:03")).toBe(3723);
  });

  it("rejects invalid input", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("1:2:3:4")).toBeNull();
    expect(parseDuration("1:xx")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats mm:ss", () => {
    expect(formatDuration(210)).toBe("3:30");
  });

  it("formats h:mm:ss", () => {
    expect(formatDuration(3723)).toBe("1:02:03");
  });

  it("formats negative durations", () => {
    expect(formatDuration(-5)).toBe("-0:05");
  });
});

describe("formatClock", () => {
  it("formats an epoch instant as HH:MM:SS", () => {
    const d = new Date(2024, 0, 1, 9, 5, 7);
    expect(formatClock(d.getTime())).toBe("09:05:07");
  });
});

describe("computeLaunchPlan", () => {
  const arrival = 1_000_000;
  const marches: March[] = [
    { id: "a", name: "Fast cavalry", marchSeconds: 60 },
    { id: "b", name: "Slow infantry", marchSeconds: 180 },
    { id: "c", name: "Medium", marchSeconds: 120 },
  ];

  it("orders marches so the longest launches first", () => {
    const plan = computeLaunchPlan(marches, arrival, 0);
    expect(plan.map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("computes launch instant as arrival minus march time", () => {
    const plan = computeLaunchPlan(marches, arrival, 0);
    const slow = plan.find((p) => p.id === "b")!;
    expect(slow.launchAtMs).toBe(arrival - 180 * 1000);
  });

  it("all marches share the same arrival time", () => {
    const plan = computeLaunchPlan(marches, arrival, 0);
    for (const entry of plan) {
      expect(entry.launchAtMs + entry.marchSeconds * 1000).toBe(arrival);
    }
  });

  it("labels status based on the current time", () => {
    // now is exactly at the fast cavalry launch instant.
    const fastLaunch = arrival - 60 * 1000;
    const plan = computeLaunchPlan(marches, arrival, fastLaunch);
    const fast = plan.find((p) => p.id === "a")!;
    const slow = plan.find((p) => p.id === "b")!;
    expect(fast.status).toBe("launch");
    expect(slow.status).toBe("late");
  });
});
