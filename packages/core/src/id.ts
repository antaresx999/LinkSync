/**
 * Erzeugt eine zufällige, weltweit eindeutige ID (UUID v4).
 * Jedes Lesezeichen und jeder Ordner bekommt so eine feste ID,
 * die sich auf allen Geräten nie ändert.
 */
export function createId(): string {
  return crypto.randomUUID();
}

/** Prüft, ob ein Text wie eine gültige ID aussieht. */
export function isValidId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
