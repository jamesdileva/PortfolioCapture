import type { PortfolioGenerator } from "../../../../packages/shared/types/index.js";

export interface PortfolioUpdateTrigger {
  requestUpdate(): void;
  getQueueLength(): number;
}

export class PortfolioUpdateTriggerImpl implements PortfolioUpdateTrigger {
  private generator: PortfolioGenerator;
  private pending = 0;
  private processing = false;
  private onSuccess?: () => void;

  constructor(generator: PortfolioGenerator, onSuccess?: () => void) {
    this.generator = generator;
    this.onSuccess = onSuccess;
  }

  requestUpdate(): void {
    this.pending++;
    this.processQueue();
  }

  getQueueLength(): number {
    return this.pending;
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.pending > 0) {
      this.pending--;
      try {
        await this.generator.generate();
        this.onSuccess?.();
      } catch {
        // Regeneration failure — previous portfolio version preserved
      }
    }

    this.processing = false;
  }
}
