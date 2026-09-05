import { describe, it, expect, vi, beforeEach } from "vitest";
import { PortfolioUpdateTriggerImpl } from "../../apps/desktop/electron/services/portfolio-update-trigger.js";
import type { PortfolioGenerator } from "../../packages/shared/types/index.js";

function createMockGenerator(): PortfolioGenerator {
  return {
    generate: vi.fn().mockResolvedValue({ outputDir: "out", projectCount: 1 }),
    getData: vi.fn().mockResolvedValue({ projects: [], generatedAt: "" }),
  } as unknown as PortfolioGenerator;
}

describe("PortfolioUpdateTriggerImpl", () => {
  let generator: ReturnType<typeof createMockGenerator>;
  let onSuccess: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    generator = createMockGenerator();
    onSuccess = vi.fn();
  });

  it("starts with zero queue length", () => {
    const trigger = new PortfolioUpdateTriggerImpl(generator as unknown as PortfolioGenerator);
    expect(trigger.getQueueLength()).toBe(0);
  });

  it("requests update triggers generator.generate()", async () => {
    const trigger = new PortfolioUpdateTriggerImpl(generator as unknown as PortfolioGenerator, onSuccess);
    trigger.requestUpdate();
    expect(generator.generate).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("queues multiple requests sequentially", async () => {
    let callCount = 0;
    const mockGenerate = vi.fn().mockImplementation(async () => {
      callCount++;
      return { outputDir: "out", projectCount: callCount };
    });

    const gen = { generate: mockGenerate } as unknown as PortfolioGenerator;
    const trigger = new PortfolioUpdateTriggerImpl(gen);

    trigger.requestUpdate();
    trigger.requestUpdate();
    trigger.requestUpdate();

    await vi.waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(3));
  });

  it("handles generator failure without throwing", async () => {
    const failingGen = {
      generate: vi.fn().mockRejectedValue(new Error("generate failed")),
    } as unknown as PortfolioGenerator;

    const trigger = new PortfolioUpdateTriggerImpl(failingGen, onSuccess);
    trigger.requestUpdate();

    // Should not throw
    await vi.waitFor(() => expect(failingGen.generate).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("calls onSuccess callback after successful generation", async () => {
    const trigger = new PortfolioUpdateTriggerImpl(generator as unknown as PortfolioGenerator, onSuccess);
    trigger.requestUpdate();

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("does not call onSuccess on failure", async () => {
    const failingGen = {
      generate: vi.fn().mockRejectedValue(new Error("fail")),
    } as unknown as PortfolioGenerator;

    const trigger = new PortfolioUpdateTriggerImpl(failingGen, onSuccess);
    trigger.requestUpdate();

    await vi.waitFor(() => expect(failingGen.generate).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("works without onSuccess callback", async () => {
    const trigger = new PortfolioUpdateTriggerImpl(generator as unknown as PortfolioGenerator);
    trigger.requestUpdate();
    expect(generator.generate).toHaveBeenCalledTimes(1);
  });

  it("processes queue after failure and continues with next", async () => {
    let callCount = 0;
    const mockGenerate = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("first fails");
      return { outputDir: "out", projectCount: callCount };
    });

    const gen = { generate: mockGenerate } as unknown as PortfolioGenerator;
    const trigger = new PortfolioUpdateTriggerImpl(gen);

    trigger.requestUpdate();
    trigger.requestUpdate();

    await vi.waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(2));
  });

  it("queue length decreases as items are processed", async () => {
    const gen = {
      generate: vi.fn().mockResolvedValue({ outputDir: "out" }),
    } as unknown as PortfolioGenerator;

    const trigger = new PortfolioUpdateTriggerImpl(gen);
    trigger.requestUpdate();

    // Queue should process quickly
    await vi.waitFor(() => expect(trigger.getQueueLength()).toBe(0));
  });
});
