import { describe, expect, it } from "vitest";
import { acknowledge, choose, displayedChoice, initialSlot, isSaving, reject } from "./answer-save-queue.ts";

describe("answer save queue", () => {
  it("sends the first choice with the acknowledged revision", () => {
    const [slot, send] = choose(initialSlot(), "A");
    expect(send).toEqual({ optionCode: "A", expectedRevision: 0 });
    expect(displayedChoice(slot)).toBe("A");
    expect(isSaving(slot)).toBe(true);
  });

  it("A then B before A is acknowledged: B waits, then goes out on top of A's revision", () => {
    const [a] = choose(initialSlot(), "A");
    const [b, sendB] = choose(a, "B");
    expect(sendB).toBeNull(); // never two saves in flight for one question
    expect(displayedChoice(b)).toBe("B");

    const [afterA, followUp] = acknowledge(b, 1);
    expect(followUp).toEqual({ optionCode: "B", expectedRevision: 1 });
    expect(displayedChoice(afterA)).toBe("B");

    const [afterB, none] = acknowledge(afterA, 2);
    expect(none).toBeNull();
    expect(afterB).toEqual({ acked: { optionCode: "B", revision: 2 }, inFlight: null, queued: null });
  });

  it("A, B, C quickly: only the latest queued choice is sent after A", () => {
    const [a] = choose(initialSlot(), "A");
    const [b] = choose(a, "B");
    const [c] = choose(b, "C");
    const [, followUp] = acknowledge(c, 1);
    expect(followUp).toEqual({ optionCode: "C", expectedRevision: 1 });
  });

  it("A, B, then back to A while A is in flight sends nothing extra", () => {
    const [a] = choose(initialSlot(), "A");
    const [b] = choose(a, "B");
    const [backToA] = choose(b, "A");
    const [saved, followUp] = acknowledge(backToA, 1);
    expect(followUp).toBeNull();
    expect(displayedChoice(saved)).toBe("A");
  });

  it("changing back to the previously saved answer while a change is in flight restores it", () => {
    const [b, sendB] = choose(initialSlot({ optionCode: "A", revision: 3 }), "B");
    expect(sendB).toEqual({ optionCode: "B", expectedRevision: 3 });
    const [backToA] = choose(b, "A");
    const [, followUp] = acknowledge(backToA, 4);
    expect(followUp).toEqual({ optionCode: "A", expectedRevision: 4 });
  });

  it("choosing the already-saved answer does not send a save", () => {
    const [slot, send] = choose(initialSlot({ optionCode: "D", revision: 1 }), "D");
    expect(send).toBeNull();
    expect(isSaving(slot)).toBe(false);
  });

  it("a refused save shows the server's answer again and keeps its revision, so the next choice is not stale", () => {
    const [b] = choose(initialSlot({ optionCode: "A", revision: 1 }), "B");
    const [c] = choose(b, "C");
    const refused = reject(c);
    expect(displayedChoice(refused)).toBe("A");
    expect(isSaving(refused)).toBe(false);

    const [, send] = choose(refused, "E");
    expect(send).toEqual({ optionCode: "E", expectedRevision: 1 });
  });
});
