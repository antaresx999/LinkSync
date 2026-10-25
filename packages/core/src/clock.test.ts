import { describe, expect, it } from 'vitest';
import { Clock, createNodeId, formatClock, parseClock } from './clock';

describe('Clock', () => {
  it('erzeugt immer grössere Zeitstempel, auch in derselben Millisekunde', () => {
    const clock = new Clock('a', undefined, () => 1000);
    const stamps = Array.from({ length: 5 }, () => clock.tick());
    expect([...stamps].sort()).toEqual(stamps);
    expect(new Set(stamps).size).toBe(5);
  });

  it('läuft nicht rückwärts, wenn die Systemuhr zurückspringt', () => {
    let now = 5000;
    const clock = new Clock('a', undefined, () => now);
    const first = clock.tick();
    now = 1000;
    expect(clock.tick() > first).toBe(true);
  });

  it('übernimmt die Zeit eines Geräts, dessen Uhr vorgeht', () => {
    const remote = new Clock('b', undefined, () => 9000).tick();
    const local = new Clock('a', undefined, () => 1000);
    local.observe(remote);
    expect(local.tick() > remote).toBe(true);
  });

  it('ignoriert Zeitstempel weit in der Zukunft', () => {
    const local = new Clock('a', undefined, () => 1000);
    local.observe(formatClock(1000 + 2 * 24 * 3600 * 1000, 0, 'b'));
    expect(parseClock(local.tick())!.ms).toBe(1000);
  });

  it('setzt nach einem Neustart mit gespeichertem Zustand fort', () => {
    const clock = new Clock('a', undefined, () => 1000);
    const before = clock.tick();
    const restored = new Clock('a', clock.getState(), () => 1000);
    expect(restored.tick() > before).toBe(true);
  });

  it('erzeugt gültige Geräte-IDs', () => {
    expect(() => new Clock(createNodeId())).not.toThrow();
    expect(() => new Clock('mit:doppelpunkt')).toThrow();
  });
});
