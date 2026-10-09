import { describe, expect, it } from "vitest";
import { getTimeListState } from "./time-list-state";

describe("getTimeListState", () => {
  it.each([
    [{ isLoading: true, isError: false, rowCount: 0 }, "loading"],
    [{ isLoading: false, isError: true, rowCount: 0 }, "error"],
    [{ isLoading: false, isError: false, rowCount: 0 }, "empty"],
    [{ isLoading: false, isError: false, rowCount: 2 }, "populated"],
  ] as const)("returns %s as %s", (input, expected) => {
    expect(getTimeListState(input)).toBe(expected);
  });
});