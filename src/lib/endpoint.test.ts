import { describe, expect, it } from "vitest";
import { isLocalEndpoint } from "@/lib/endpoint";

/** Must agree with the backend's `resolve_endpoint`, which is the real gate. */
describe("isLocalEndpoint", () => {
  it.each(["", "http://localhost:11434", "http://LOCALHOST:1", "http://127.0.0.1:11434", "http://[::1]:11434"])(
    "treats %j as this machine",
    url => expect(isLocalEndpoint(url)).toBe(true),
  );

  it.each(["http://192.168.1.20:11434", "https://ai.example.com", "http://10.0.0.5"])(
    "treats %j as remote",
    url => expect(isLocalEndpoint(url)).toBe(false),
  );

  it("does not call unparseable input remote; the backend rejects it with a clear error", () => {
    expect(isLocalEndpoint("not a url")).toBe(true);
  });
});
