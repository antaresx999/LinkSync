/**
 * "Hybride logische Uhr" (HLC).
 *
 * Jede Änderung bekommt einen Zeitstempel als Text, z. B.
 *   000001761400000000:000000:a1b2c3d4e5f6a7b8
 *   ^ Millisekunden    ^ Zähler ^ Geräte-ID
 *
 * Die Texte lassen sich einfach alphabetisch vergleichen: Der grössere ist
 * neuer. Der Zähler sorgt dafür, dass mehrere Änderungen in derselben
 * Millisekunde trotzdem eine eindeutige Reihenfolge haben. Die Geräte-ID
 * macht Zeitstempel verschiedener Geräte immer unterschiedlich.
 *
 * Geht die Uhr eines Geräts nach, übernimmt es beim Sync die Zeit der
 * anderen Geräte. So überholen neue Änderungen trotzdem ältere.
 */

/** Zeitstempel, die mehr als einen Tag in der Zukunft liegen, werden nicht übernommen. */
const MAX_FUTURE_DRIFT_MS = 24 * 60 * 60 * 1000;

export function createNodeId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ClockState {
  ms: number;
  counter: number;
}

export class Clock {
  private state: ClockState;

  constructor(
    readonly nodeId: string,
    state: ClockState = { ms: 0, counter: 0 },
    private readonly now: () => number = Date.now,
  ) {
    if (!/^[0-9a-z]{1,32}$/.test(nodeId)) throw new Error('Ungültige Geräte-ID');
    this.state = { ...state };
  }

  /** Neuen Zeitstempel für eine lokale Änderung erzeugen. */
  tick(): string {
    const now = this.now();
    if (now > this.state.ms) {
      this.state = { ms: now, counter: 0 };
    } else {
      this.state = { ms: this.state.ms, counter: this.state.counter + 1 };
    }
    return formatClock(this.state.ms, this.state.counter, this.nodeId);
  }

  /** Zeitstempel eines anderen Geräts berücksichtigen. */
  observe(stamp: string): void {
    const parsed = parseClock(stamp);
    if (!parsed) return;
    if (parsed.ms > this.now() + MAX_FUTURE_DRIFT_MS) return;
    if (parsed.ms > this.state.ms) {
      this.state = { ms: parsed.ms, counter: parsed.counter };
    } else if (parsed.ms === this.state.ms && parsed.counter > this.state.counter) {
      this.state = { ms: parsed.ms, counter: parsed.counter };
    }
  }

  /** Zum Speichern, damit die Uhr nach einem Neustart weiterläuft. */
  getState(): ClockState {
    return { ...this.state };
  }
}

export function formatClock(ms: number, counter: number, nodeId: string): string {
  return `${ms.toString().padStart(18, '0')}:${counter.toString().padStart(6, '0')}:${nodeId}`;
}

export function parseClock(stamp: string): { ms: number; counter: number; nodeId: string } | null {
  const m = /^(\d{18}):(\d{6}):([0-9a-z]{1,32})$/.exec(stamp);
  if (!m) return null;
  return { ms: Number(m[1]), counter: Number(m[2]), nodeId: m[3]! };
}
