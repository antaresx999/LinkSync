/**
 * Entpacken von LZUTF8-komprimierten Daten (wie sie xBrowserSync verwendet).
 *
 * Das Format ist ein einfaches LZ77-Verfahren auf UTF-8-Bytes:
 *  - Bytes, die nicht mit 11 beginnen, sind normale Zeichen.
 *  - 110xxxxx dd       → "kopiere xxxxx Bytes von dd Bytes weiter vorne"
 *  - 111xxxxx dd dd    → dasselbe mit 16-Bit-Abstand
 *  Folgt auf ein 11…-Byte ein Byte, das mit 1 beginnt, ist es dagegen der
 *  Anfang eines normalen mehrbytigen UTF-8-Zeichens.
 */
export function lzutf8Decompress(input: Uint8Array): string {
  const output: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const value = input[i]!;
    if (value >>> 6 !== 3 || i === input.length - 1 || input[i + 1]! >>> 7 === 1) {
      output.push(value);
      continue;
    }
    const length = value & 31;
    let distance: number;
    if (value >>> 5 === 6) {
      distance = input[i + 1]!;
      i += 1;
    } else {
      if (i + 2 >= input.length) throw new Error('LZUTF8: Daten abgeschnitten');
      distance = (input[i + 1]! << 8) | input[i + 2]!;
      i += 2;
    }
    const start = output.length - distance;
    if (start < 0 || distance === 0) throw new Error('LZUTF8: ungültiger Verweis');
    for (let k = 0; k < length; k++) output.push(output[start + k]!);
  }
  return new TextDecoder().decode(new Uint8Array(output));
}
