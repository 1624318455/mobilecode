// Busy -> idle edge detection per session key. A bare `idle` event means
// nothing on its own (reconnects and initial snapshots are idle too) —
// only an idle that follows observed activity counts as "reply finished".
export class ReplyTracker {
  private busy = new Map<string, boolean>();

  noteActivity(key: string): void {
    this.busy.set(key, true);
  }

  // Returns true exactly on the busy -> idle edge.
  noteIdle(key: string): boolean {
    const was = this.busy.get(key) ?? false;
    this.busy.set(key, false);

    return was;
  }

  activeCount(): number {
    let count = 0;

    for (const active of this.busy.values()) {
      if (active) {
        count++;
      }
    }

    return count;
  }

  reset(): void {
    this.busy.clear();
  }
}
