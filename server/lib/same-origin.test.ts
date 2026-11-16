import { describe, expect, it } from "vitest";
import { isSameHostOrigin } from "./same-origin.js";

describe("isSameHostOrigin", () => {
  it("accepts the app's own origin on a custom domain or LAN address", () => {
    expect(isSameHostOrigin("https://erd.example.com", "erd.example.com", "https")).toBe(true);
    expect(isSameHostOrigin("http://192.168.1.20:3000", "192.168.1.20:3000", "http")).toBe(true);
    expect(isSameHostOrigin("https://ERD.example.com", "erd.example.com", "https")).toBe(true);
  });

  it("accepts an https page behind a TLS proxy that sends no X-Forwarded-Proto", () => {
    expect(isSameHostOrigin("https://erd.example.com", "erd.example.com", "http")).toBe(true);
  });

  it("rejects another host, port or scheme", () => {
    expect(isSameHostOrigin("https://evil.example", "erd.example.com", "https")).toBe(false);
    expect(isSameHostOrigin("https://erd.example.com.evil.example", "erd.example.com", "https")).toBe(false);
    expect(isSameHostOrigin("http://192.168.1.20:8080", "192.168.1.20:3000", "http")).toBe(false);
    expect(isSameHostOrigin("http://erd.example.com", "erd.example.com", "https")).toBe(false);
  });

  it("rejects a missing or unparseable origin or host", () => {
    expect(isSameHostOrigin(undefined, "erd.example.com", "https")).toBe(false);
    expect(isSameHostOrigin("null", "erd.example.com", "https")).toBe(false);
    expect(isSameHostOrigin("https://erd.example.com", undefined, "https")).toBe(false);
  });
});
