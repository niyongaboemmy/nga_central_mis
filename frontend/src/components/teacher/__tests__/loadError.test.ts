import { describe, it, expect } from "vitest";
import { describeLoadError } from "../loadError";

// The dashboard went down in production and the only thing on screen was
// "We couldn't load your dashboard", which is compatible with a timeout, a
// half-finished deploy and a 500 alike. Each mode has to name itself.
describe("describeLoadError", () => {
  it("names an axios timeout as a timeout", () => {
    const failure = describeLoadError({
      code: "ECONNABORTED",
      message: "timeout of 30000ms exceeded",
    });
    expect(failure.detail).toBe("request timed out");
    expect(failure.message).toMatch(/too long/i);
    expect(failure.retryable).toBe(true);
  });

  it("calls a 404 what it is — an API older than the app", () => {
    const failure = describeLoadError({ response: { status: 404 } });
    expect(failure.detail).toBe("404 — endpoint not found");
    expect(failure.message).toMatch(/backend release/i);
    // Retrying a missing endpoint just fails again.
    expect(failure.retryable).toBe(false);
  });

  it("separates a server error from a client one", () => {
    expect(describeLoadError({ response: { status: 500 } })).toMatchObject({
      detail: "500 — server error",
      retryable: true,
    });
    expect(describeLoadError({ response: { status: 403 } })).toMatchObject({
      detail: "403 — forbidden",
      retryable: false,
    });
  });

  it("reports a dropped connection as a network problem, not a server fault", () => {
    expect(describeLoadError({ code: "ERR_NETWORK" })).toMatchObject({
      detail: "network error (ERR_NETWORK)",
      retryable: true,
    });
    expect(describeLoadError(new Error("boom")).detail).toBe("network error");
  });

  it("still answers for something that isn't an axios error at all", () => {
    const failure = describeLoadError(undefined);
    expect(failure.message).toBeTruthy();
    expect(failure.retryable).toBe(true);
  });
});
