import { describe, expect, it } from "vitest";
import { ascending, maxOf, minOf, mod, sum } from "@core/utils/math";
import { lowerBound, upperBound } from "@core/utils/search";

describe("mod", () => {
  it("wraps into 0..11 by default", () => {
    expect([0, 11, 12, 13, 25].map((n) => mod(n))).toEqual([0, 11, 0, 1, 1]);
  });
  it("wraps negatives upward, unlike %", () => {
    expect([-1, -12, -13].map((n) => mod(n))).toEqual([11, 0, 11]);
  });
  it("takes another modulus", () => {
    expect([mod(7, 3), mod(-1, 3), mod(5.5, 2)]).toEqual([1, 2, 1.5]);
  });
});

describe("ascending", () => {
  it("sorts numbers numerically, not as text", () => {
    expect([10, 9, 1, 100].sort(ascending)).toEqual([1, 9, 10, 100]);
  });
  it("is negative, zero or positive", () => {
    expect([ascending(1, 2), ascending(2, 2), ascending(3, 2)]).toEqual([-1, 0, 1]);
  });
});

describe("sum, maxOf, minOf", () => {
  it("add up and pick extremes", () => {
    expect([sum([1, 2, 3.5]), maxOf([3, -1, 7, 2]), minOf([3, -1, 7, 2])]).toEqual([6.5, 7, -1]);
  });
  it("have identities for an empty list", () => {
    expect([sum([]), maxOf([]), minOf([])]).toEqual([0, -Infinity, Infinity]);
  });
  it("handle lists too long to spread into Math.max", () => {
    const long = Array.from({ length: 500_000 }, (_, index) => index);
    expect([maxOf(long), minOf(long), sum(long)]).toEqual([499_999, 0, (499_999 * 500_000) / 2]);
  });
});

describe("lowerBound / upperBound", () => {
  const values = [1, 3, 3, 3, 5, 8];
  const same = (value: number) => value;

  it("lowerBound finds the first item at least the value", () => {
    expect([0, 1, 2, 3, 4, 5, 8, 9].map((value) => lowerBound(values, value, same))).toEqual([0, 0, 1, 1, 4, 4, 5, 6]);
  });
  it("upperBound finds the first item greater than the value", () => {
    expect([0, 1, 2, 3, 4, 5, 8, 9].map((value) => upperBound(values, value, same))).toEqual([0, 1, 1, 4, 4, 5, 6, 6]);
  });
  it("both give 0 for an empty list", () => {
    expect([lowerBound([], 5, same), upperBound([], 5, same)]).toEqual([0, 0]);
  });
  it("read the key through the function given", () => {
    const items = [{ start: 1 }, { start: 4 }, { start: 9 }];

    expect(lowerBound(items, 4, (item) => item.start)).toBe(1);
    expect(upperBound(items, 4, (item) => item.start)).toBe(2);
  });
  it("agree with a plain scan on random sorted lists", () => {
    let seed = 5;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 20;

    for (let round = 0; round < 200; round++) {
      const list = Array.from({ length: next() }, next).sort((a, b) => a - b);
      const value = next() - 2;

      expect(lowerBound(list, value, same)).toBe(
        list.findIndex((item) => item >= value) === -1 ? list.length : list.findIndex((item) => item >= value),
      );
      expect(upperBound(list, value, same)).toBe(
        list.findIndex((item) => item > value) === -1 ? list.length : list.findIndex((item) => item > value),
      );
    }
  });
});
