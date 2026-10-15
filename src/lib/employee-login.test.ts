import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  digitsOnly,
  findEmployeeLoginIssues,
  isValidEmployeePin,
  phonePinMatches,
  postLoginRedirectPath,
} from "./employee-login";

describe("digitsOnly normalization", () => {
  it("normalizes formatted and digits-only phone numbers to the same value", () => {
    const variants = ["(508) 555-1234", "508-555-1234", "5085551234", " 508 555 1234 "];
    const normalized = variants.map(digitsOnly);
    for (const value of normalized) {
      expect(value).toBe("5085551234");
    }
  });

  it("handles null and undefined safely", () => {
    expect(digitsOnly(null)).toBe("");
    expect(digitsOnly(undefined)).toBe("");
  });
});

describe("phonePinMatches", () => {
  it("accepts a digits-only PIN matching the stored phone", () => {
    expect(phonePinMatches("5085551234", "(508) 555-1234")).toBe(true);
  });

  it("accepts formatted input matching the stored digits-only phone", () => {
    expect(phonePinMatches("(508) 555-1234", "5085551234")).toBe(true);
  });

  it("rejects a wrong phone number", () => {
    expect(phonePinMatches("5085559999", "(508) 555-1234")).toBe(false);
  });

  it("rejects when the employee has no phone", () => {
    expect(phonePinMatches("5085551234", null)).toBe(false);
    expect(phonePinMatches("5085551234", "")).toBe(false);
  });

  it("rejects when the stored phone has an invalid length", () => {
    expect(phonePinMatches("123", "123")).toBe(false);
    expect(phonePinMatches("508555123", "508555123")).toBe(false);
  });

  it("validates PIN length", () => {
    expect(isValidEmployeePin("5085551234")).toBe(true);
    expect(isValidEmployeePin("508555123")).toBe(false);
    expect(isValidEmployeePin("50855512345")).toBe(false);
  });
});

describe("findEmployeeLoginIssues (synthetic data only)", () => {
  it("flags missing email, missing phone, invalid length, and duplicates without exposing raw values", () => {
    const issues = findEmployeeLoginIssues([
      { id: 1, name: "No Email", email: null, phone: "5085550001", role: "employee" },
      { id: 2, name: "No Phone", email: "synthetic-no-phone@example.test", phone: null, role: "employee" },
      { id: 3, name: "Short Phone", email: "synthetic-short@example.test", phone: "555-12", role: "employee" },
      { id: 4, name: "Dup One", email: "synthetic-dup1@example.test", phone: "(508) 555-9999", role: "employee" },
      { id: 5, name: "Dup Two", email: "synthetic-dup2@example.test", phone: "508-555-9999", role: "employee" },
      { id: 6, name: "Healthy", email: "synthetic-ok@example.test", phone: "5085550002", role: "employee" },
      { id: 7, name: "Admin No Phone", email: "synthetic-admin@example.test", phone: null, role: "admin" },
    ]);

    expect(issues).toEqual([
      { userId: 1, name: "No Email", kind: "missing_email" },
      { userId: 2, name: "No Phone", kind: "missing_phone" },
      { userId: 3, name: "Short Phone", kind: "invalid_phone_length" },
      { userId: 4, name: "Dup One", kind: "duplicate_phone" },
      { userId: 5, name: "Dup Two", kind: "duplicate_phone" },
    ]);

    // Never leak raw emails or phone numbers in the diagnostic output.
    const serialized = JSON.stringify(issues);
    expect(serialized).not.toContain("@example.test");
    expect(serialized).not.toMatch(/\d{10}/);
  });
});

describe("postLoginRedirectPath", () => {
  it("redirects employees to /clock and admins to /dashboard", () => {
    expect(postLoginRedirectPath("employee")).toBe("/clock");
    expect(postLoginRedirectPath("admin")).toBe("/dashboard");
  });
});

describe("public login page", () => {
  it("has no prefilled or displayed default credentials", () => {
    const source = readFileSync(new URL("../app/(auth)/login/page.tsx", import.meta.url), "utf8");
    expect(source).toContain('useState("")');
    expect(source).not.toMatch(/useState\(["'][^"']+["']\)/);
    expect(source).not.toContain("Default:");
  });
});
