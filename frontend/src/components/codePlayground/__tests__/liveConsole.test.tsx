import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import LiveConsole from "../LiveConsole";
import { streamLiveRun, type SessionEvent } from "../../../api/codePlayground";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const setup = (props: Partial<React.ComponentProps<typeof LiveConsole>> = {}) => {
  const onLine = vi.fn();
  const onEof = vi.fn();
  const onInterrupt = vi.fn();
  const utils = render(
    <LiveConsole chunks={[]} running stage="run" lastOutputAt={Date.now()} onLine={onLine} onEof={onEof} onInterrupt={onInterrupt} {...props} />,
  );
  return { ...utils, onLine, onEof, onInterrupt };
};

describe("LiveConsole", () => {
  it("puts the input box right after a prompt and says the program is waiting", () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    setup({ chunks: [{ kind: "out", text: "Your name? " }], lastOutputAt: t0 });
    act(() => void vi.advanceTimersByTime(300));
    const input = screen.getByTestId("playground-stdin");
    expect(input.parentElement?.previousElementSibling?.textContent).toBe("Your name? ");
    expect(screen.getByTestId("playground-waiting").textContent).toMatch(/waiting for input/);
  });

  it("offers input gently when the program is just quiet, not after a full line at once", () => {
    vi.useFakeTimers();
    setup({ chunks: [{ kind: "out", text: "Working...\n" }], lastOutputAt: Date.now() });
    expect(screen.queryByTestId("playground-waiting")).toBeNull();
    expect(screen.queryByTestId("playground-quiet")).toBeNull();
    act(() => void vi.advanceTimersByTime(1200));
    expect(screen.getByTestId("playground-quiet")).toBeTruthy();
  });

  it("sends a line on Enter, recalls it with ↑, ends input with Ctrl+D and interrupts with Ctrl+C", () => {
    const { onLine, onEof, onInterrupt } = setup({ chunks: [{ kind: "out", text: "n? " }] });
    const input = screen.getByTestId("playground-stdin") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onLine).toHaveBeenCalledWith("42");
    expect(input.value).toBe("");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.value).toBe("42");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "d", ctrlKey: true });
    expect(onEof).toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "c", ctrlKey: true });
    expect(onInterrupt).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("playground-eof"));
    expect(onEof).toHaveBeenCalledTimes(2);
  });

  it("has no input box while building or after the program ended", () => {
    const { rerender, onLine, onEof, onInterrupt } = setup({ stage: "build" });
    expect(screen.queryByTestId("playground-stdin")).toBeNull();
    expect(screen.getByTestId("playground-console-status").textContent).toMatch(/Building/);
    rerender(<LiveConsole chunks={[{ kind: "out", text: "done\n" }]} running={false} stage={null} lastOutputAt={0} onLine={onLine} onEof={onEof} onInterrupt={onInterrupt} />);
    expect(screen.queryByTestId("playground-stdin")).toBeNull();
    expect(screen.queryByTestId("playground-console-status")).toBeNull();
  });

  it("shows typed input and errors distinctly", () => {
    setup({ chunks: [{ kind: "out", text: "n? " }, { kind: "in", text: "4\n" }, { kind: "err", text: "boom\n" }, { kind: "note", text: "Exited with code 1." }] });
    expect(document.querySelector('[data-kind="in"]')?.textContent).toBe("4\n");
    expect(document.querySelector('[data-kind="err"]')?.className).toMatch(/danger|red/);
    expect(document.querySelector("[data-note]")?.textContent).toBe("Exited with code 1.");
  });
});

describe("streamLiveRun", () => {
  it("parses server-sent events split across network chunks", async () => {
    const text = 'event: stage\ndata: {"name":"run"}\n\nevent: stdout\ndata: {"data":"Name? "}\n\n: keep-alive\n\nevent: exit\ndata: {"code":0,"signal":null,"verdict":"ok","time_ms":3,"memory_kb":null}\n\n';
    const enc = new TextEncoder();
    const parts = [text.slice(0, 17), text.slice(17, 60), text.slice(60)];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of parts) c.enqueue(enc.encode(p));
        c.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body });
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("token", "tok");
    const seen: SessionEvent[] = [];
    await streamLiveRun("abc123def456", (e) => seen.push(e), new AbortController().signal);
    expect(seen.map((e) => e.event)).toEqual(["stage", "stdout", "exit"]);
    expect(seen[1]).toEqual({ event: "stdout", data: { data: "Name? " } });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/code-playground\/sessions\/abc123def456\/events$/);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });
});
