export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export type AutosaveSave<P> = (patch: P, options: { keepalive: boolean }) => Promise<void>;

/**
 * Debounced, coalescing save queue, kept free of React so its timing rules
 * can be unit-tested directly (lib/hooks/useAutosave.ts wraps it).
 *
 * - schedule() shallow-merges a patch into what's pending and restarts the
 *   debounce timer, so a burst of keystrokes becomes one request.
 * - Only one save is ever in flight; edits made during it are sent after it
 *   finishes, never interleaved, so the last edit always wins on the server.
 * - A failed save keeps its patch (merged under any newer edits) so retry()
 *   resends it, and does not retry on its own.
 */
export class AutosaveQueue<P extends object> {
  status: AutosaveStatus = "idle";
  error: string | null = null;
  private pending: Partial<P> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    private save: AutosaveSave<Partial<P>>,
    private readonly delayMs: number,
    private readonly onStatus: (status: AutosaveStatus, error: string | null) => void = () => {}
  ) {}

  /** Swaps the save function used from now on (e.g. a fresh closure each render). */
  setSave(save: AutosaveSave<Partial<P>>): void {
    this.save = save;
  }

  schedule(patch: Partial<P>): void {
    this.pending = { ...(this.pending ?? {}), ...patch };
    this.setStatus("pending", null);
    this.startTimer();
  }

  hasUnsaved(): boolean {
    return this.pending !== null || this.inFlight !== null;
  }

  async flush(options: { keepalive?: boolean } = {}): Promise<void> {
    this.clearTimer();
    while (this.inFlight) await this.inFlight;
    if (!this.pending) return;

    const patch = this.pending;
    this.pending = null;
    this.setStatus("saving", null);

    this.inFlight = this.save(patch, { keepalive: options.keepalive ?? false })
      .then(
        () => this.setStatus(this.pending ? "pending" : "saved", null),
        (err: unknown) => {
          this.pending = { ...patch, ...(this.pending ?? {}) };
          this.setStatus("error", err instanceof Error ? err.message : "Couldn't save.");
        }
      )
      .finally(() => {
        this.inFlight = null;
      });
    await this.inFlight;

    if (this.pending && this.status === "pending" && !this.timer) this.startTimer();
  }

  retry(): Promise<void> {
    return this.flush();
  }

  dispose(): void {
    this.clearTimer();
  }

  private startTimer() {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delayMs);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setStatus(status: AutosaveStatus, error: string | null) {
    this.status = status;
    this.error = error;
    this.onStatus(status, error);
  }
}
