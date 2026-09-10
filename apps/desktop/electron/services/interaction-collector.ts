import type {
  InteractionEvent,
  InteractionCollector,
  InteractionCollectorConfig,
} from "../../../../packages/shared/types/index.js";

const DEFAULT_ACCELERATORS = [
  "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Z", "Ctrl+A",
  "Ctrl+S", "Ctrl+F", "Ctrl+G", "Ctrl+D", "Ctrl+Y",
  "Ctrl+B", "Ctrl+I", "Ctrl+U", "Ctrl+W", "Ctrl+T",
  "Ctrl+N", "Ctrl+O", "Ctrl+P", "Ctrl+R", "Ctrl+L",
  "Tab", "Enter", "Backspace", "Delete", "Escape",
  "Space", "Up", "Down", "Left", "Right",
  "Home", "End", "PageUp", "PageDown",
  "F1", "F2", "F3", "F4", "F5", "F6",
  "F7", "F8", "F9", "F10", "F11", "F12",
];

export type RegisterFn = (accelerator: string, callback: () => void) => boolean;
export type UnregisterFn = (accelerator: string) => boolean;
export type UnregisterAllFn = () => void;

export class InteractionCollectorImpl implements InteractionCollector {
  private events: InteractionEvent[] = [];
  private running = false;
  private accelerators: string[];
  private nowFn: () => number;
  private registerFn: RegisterFn;
  private unregisterFn: UnregisterFn;
  private unregisterAllFn: UnregisterAllFn;
  private registeredAccelerators: string[] = [];

  constructor(opts?: {
    config?: InteractionCollectorConfig;
    registerFn?: RegisterFn;
    unregisterFn?: UnregisterFn;
    unregisterAllFn?: UnregisterAllFn;
  }) {
    this.accelerators = opts?.config?.accelerators ?? DEFAULT_ACCELERATORS;
    this.nowFn = opts?.config?.nowFn ?? (() => Date.now());
    this.registerFn = opts?.registerFn ?? (() => false);
    this.unregisterFn = opts?.unregisterFn ?? (() => false);
    this.unregisterAllFn = opts?.unregisterAllFn ?? (() => {});
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    for (const accelerator of this.accelerators) {
      const ok = this.registerFn(accelerator, () => {
        if (!this.running) return;
        this.events.push({
          timestampMs: this.nowFn(),
          type: "keyboard",
          accelerator,
        });
      });
      if (ok) {
        this.registeredAccelerators.push(accelerator);
      }
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.unregisterAllFn();
    this.registeredAccelerators = [];
  }

  getEvents(): InteractionEvent[] {
    return [...this.events];
  }

  getTimestamps(): number[] {
    return this.events.map((e) => e.timestampMs);
  }

  reset(): void {
    this.events = [];
    if (this.running) {
      this.unregisterAllFn();
      this.registeredAccelerators = [];
    }
    this.running = false;
  }
}
