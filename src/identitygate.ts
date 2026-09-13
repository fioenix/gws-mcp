/**
 * Serialises identity changes against the calls that depend on them.
 *
 * `gws_profile_use` mutates state that every `gws_call` reads at spawn time, and MCP
 * serves tool calls concurrently — clients routinely emit a switch and several calls
 * in one batch. Without a gate those calls can start before the switch lands and run
 * as the previous identity, reading (or writing) the wrong account's data while the
 * agent believes it switched.
 *
 * Calls hold the gate in shared mode, so the common path stays fully parallel. A
 * switch holds it exclusively: it waits for in-flight calls to finish and holds off
 * new ones until it completes. Readers arriving while a switch is queued also wait,
 * so a steady stream of calls cannot starve the switch indefinitely.
 */
export class IdentityGate {
  private readers = 0;
  private writing = false;
  private writersWaiting = 0;
  private waiters: (() => void)[] = [];

  private wake(): void {
    const pending = this.waiters;
    this.waiters = [];
    for (const resume of pending) resume();
  }

  private block(): Promise<void> {
    return new Promise<void>((resume) => this.waiters.push(resume));
  }

  async shared<T>(fn: () => Promise<T>): Promise<T> {
    while (this.writing || this.writersWaiting > 0) await this.block();
    this.readers++;
    try {
      return await fn();
    } finally {
      this.readers--;
      this.wake();
    }
  }

  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    this.writersWaiting++;
    try {
      while (this.writing || this.readers > 0) await this.block();
      this.writing = true;
    } finally {
      this.writersWaiting--;
    }
    try {
      return await fn();
    } finally {
      this.writing = false;
      this.wake();
    }
  }
}
