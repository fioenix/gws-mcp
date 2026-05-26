import { appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";

export interface AuditEntry {
  ts: string;
  event: string;
  tool?: string;
  args?: unknown;
  ok?: boolean;
  exitCode?: number | null;
  durationMs?: number;
  error?: string;
  client?: string;
}

export class AuditLogger {
  constructor(private readonly file: string) {}

  async log(entry: Omit<AuditEntry, "ts">): Promise<void> {
    const full: AuditEntry = { ts: new Date().toISOString(), ...entry };
    const line = JSON.stringify(full) + "\n";
    if (this.file) {
      try {
        await mkdir(dirname(this.file), { recursive: true });
        await appendFile(this.file, line, "utf8");
        return;
      } catch (e) {
        process.stderr.write(`[gws-mcp] audit-write-failed: ${(e as Error).message}\n`);
      }
    }
    process.stderr.write(`[gws-mcp][audit] ${line}`);
  }
}
