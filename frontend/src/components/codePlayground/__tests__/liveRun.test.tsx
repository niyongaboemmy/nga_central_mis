import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { appendChunk, driveLiveRun, exitNote, type LiveInput, type LiveTransport, type SessionEvent } from "../../../vendor/nga-liveconsole";
import { useLiveRun } from "../../../vendor/nga-liveconsole/useLiveRun";

/**
 * nga-liveconsole with its transport mocked: a run from start to end, input typed while
 * the program waits, stop, and a runner without live runs.
 */

afterEach(() => cleanup());

/** A transport whose event stream the test feeds by hand. */
function fakeTransport(id = "abc123def456") {
  let push: (e: SessionEvent) => void = () => undefined;
  let finish: () => void = () => undefined;
  const t = {
    start: vi.fn(async () => id),
    stream: vi.fn(
      (_id: string, onEvent: (e: SessionEvent) => void, signal: AbortSignal) =>
        new Promise<void>((resolve) => {
          push = onEvent;
          finish = resolve;
          signal.addEventListener("abort", () => resolve());
        }),
    ),
    input: vi.fn(async (_id: string, _body: LiveInput) => undefined),
    stop: vi.fn(async (_id: string) => undefined),
  } satisfies LiveTransport<{ files: string[] }>;
  return { t, emit: (e: SessionEvent) => push(e), end: () => finish() };
}

describe("driveLiveRun", () => {
  it("starts, sends input typed in advance, relays events and reports the end", async () => {
    const { t, emit, end } = fakeTransport();
    const seen: string[] = [];
    const done = driveLiveRun(t, { files: [] }, {
      signal: new AbortController().signal,
      current: () => true,
      prefill: "Ama",
      started: (id) => seen.push(`started ${id}`),
      typed: (text) => seen.push(`typed ${JSON.stringify(text)}`),
      event: (ev) => seen.push(ev.event),
      failed: () => seen.push("failed"),
      lost: () => seen.push("lost"),
      ended: (exited) => seen.push(`ended ${exited}`),
    });
    await waitFor(() => expect(t.stream).toHaveBeenCalled());
    emit({ event: "stdout", data: { data: "Hi Ama\n" } });
    emit({ event: "exit", data: { code: 0, signal: null, verdict: "ok", time_ms: 5, memory_kb: null } });
    end();
    await done;
    expect(seen).toEqual(["started abc123def456", 'typed "Ama\\n"', "stdout", "exit", "ended true"]);
    expect(t.input).toHaveBeenCalledWith("abc123def456", { data: "Ama\n" });
  });

  it("stops a session that started after the run was replaced, and reports a failed start", async () => {
    const { t } = fakeTransport();
    const failed = vi.fn();
    await driveLiveRun(t, { files: [] }, { signal: new AbortController().signal, current: () => false, started: vi.fn(), typed: vi.fn(), event: vi.fn(), failed, lost: vi.fn(), ended: vi.fn() });
    expect(t.stop).toHaveBeenCalledWith("abc123def456");
    t.start.mockRejectedValueOnce(Object.assign(new Error("No live runs here."), { code: "INTERACTIVE_UNAVAILABLE" }));
    await driveLiveRun(t, { files: [] }, { signal: new AbortController().signal, current: () => true, started: vi.fn(), typed: vi.fn(), event: vi.fn(), failed, lost: vi.fn(), ended: vi.fn() });
    expect(failed.mock.calls[0][0]).toMatchObject({ code: "INTERACTIVE_UNAVAILABLE" });
  });

  it("joins output of one kind and says how the program ended", () => {
    const c = appendChunk(appendChunk([], { kind: "out", text: "a" }), { kind: "out", text: "b" });
    expect(c).toEqual([{ kind: "out", text: "ab" }]);
    expect(exitNote({ code: 3, signal: null, verdict: "runtime-error", time_ms: 1, memory_kb: null })).toBe("Exited with code 3.");
    expect(exitNote({ code: null, signal: "SIGINT", verdict: "runtime-error", time_ms: 1, memory_kb: null })).toBe("Stopped (SIGINT).");
    expect(exitNote({ code: 1, signal: null, verdict: "compile-error", time_ms: 1, memory_kb: null })).toBe("");
  });
});

describe("useLiveRun", () => {
  it("streams output, sends typed lines, end of input and Ctrl+C, then shows the exit", async () => {
    const { t, emit } = fakeTransport();
    const { result } = renderHook(() => useLiveRun(t));
    act(() => void result.current.start({ files: ["Main.java"] }));
    await waitFor(() => expect(result.current.state.live?.id).toBe("abc123def456"));
    act(() => emit({ event: "stage", data: { name: "build" } }));
    act(() => emit({ event: "stage", data: { name: "run" } }));
    act(() => emit({ event: "stdout", data: { data: "Name: " } }));
    act(() => result.current.sendLine("Ama"));
    act(() => result.current.sendEof());
    act(() => result.current.interrupt());
    expect(t.input.mock.calls.map((c) => c[1])).toEqual([{ data: "Ama\n" }, { eof: true }, { signal: "SIGINT" }]);
    act(() => emit({ event: "stdout", data: { data: "Hi Ama\n" } }));
    act(() => emit({ event: "exit", data: { code: 0, signal: null, verdict: "ok", time_ms: 12, memory_kb: 2048 } }));
    const s = result.current.state;
    expect(s.phase).toBe("done");
    expect(s.exit).toMatchObject({ verdict: "ok", time_ms: 12 });
    expect(s.output).toBe("Name: Hi Ama\n");
    expect(s.console.map((c) => [c.kind, c.text])).toEqual([
      ["note", "Building your program…"],
      ["note", "Running…"],
      ["out", "Name: "],
      ["in", "Ama\n"],
      ["note", "End of input sent."],
      ["out", "Hi Ama\n"],
    ]);
  });

  it("stops the program on Stop, and says plainly when live runs aren't available", async () => {
    const { t } = fakeTransport();
    const onUnavailable = vi.fn();
    const { result } = renderHook(() => useLiveRun(t, { onUnavailable }));
    act(() => void result.current.start({ files: [] }));
    await waitFor(() => expect(result.current.state.live?.id).toBe("abc123def456"));
    act(() => result.current.stop());
    expect(t.stop).toHaveBeenCalledWith("abc123def456");
    expect(result.current.state).toMatchObject({ phase: "done", stopped: true });
    t.start.mockRejectedValueOnce(Object.assign(new Error("Interactive runs aren't available here yet."), { code: "INTERACTIVE_UNAVAILABLE" }));
    await act(() => result.current.start({ files: [] }));
    expect(onUnavailable).toHaveBeenCalledWith("Interactive runs aren't available here yet.");
    expect(result.current.state.error).toEqual({ code: "INTERACTIVE_UNAVAILABLE", message: "Interactive runs aren't available here yet." });
  });
});
