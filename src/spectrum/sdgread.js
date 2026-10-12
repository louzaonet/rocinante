// Lectura de la base de gráficos de DAAD en Spectrum (la que va al final de la
// memoria, en las dos versiones de DAAD). Los punteros están en FFEFh:
//   FFEF datos   FFF1 tabla de punteros a cada dibujo   FFF3 ventanas (5 bytes
//   por dibujo: atributo con el bit 7 = de localidad, línea, columna, alto,
//   ancho)   FFF5 fin de las ventanas   FFF7 juego de caracteres (2048 bytes)
//   FFF9 tabla de colores: borde, y desde el byte 1 el color de Spectrum de
//   cada color de INK, PAPER y BORDER   FFFD número de dibujos
// El dibujo n va de su puntero hasta la orden END (7).
import { opLen } from '../gfx/vector.js';

export function readSDG(mem) {
  const w = (a) => mem[a] | (mem[a + 1] << 8);
  const data = w(0xffef), ptrs = w(0xfff1), wins = w(0xfff3), winEnd = w(0xfff5), cs = w(0xfff7), colours = w(0xfff9);
  const n = mem[0xfffd];
  // comprobaciones: todo en la parte alta de la memoria y en orden
  if (!n || !(data >= 0x6000 && data <= ptrs && ptrs < wins && wins + 5 * n === winEnd && winEnd < cs && cs + 2048 <= 0xfff0)) return null;
  if (colours < cs || colours > 0xffe8) return null;
  const pictures = [];
  for (let i = 0; i < n; i++) {
    const a = w(ptrs + 2 * i);
    if (a < data || a >= ptrs) return null;
    const d = [];
    for (let k = a; k < ptrs;) {
      const len = opLen(mem, k);
      for (let j = 0; j < len; j++) d.push(mem[k + j]);
      if ((mem[k] & 7) === 7) break;
      k += len;
    }
    const at = mem[wins + 5 * i];
    pictures.push({
      number: i, data: d, location: !!(at & 0x80), paper: (at >> 3) & 7, ink: at & 7,
      line: mem[wins + 5 * i + 1], col: mem[wins + 5 * i + 2], height: mem[wins + 5 * i + 3], width: mem[wins + 5 * i + 4],
    });
  }
  return {
    pictures,
    charset: mem.slice(cs, cs + 2048),
    // INK n, PAPER n y BORDER n ponen el color colourMap[n]
    colourMap: Array.from(mem.subarray(colours + 1, colours + 9)),
  };
}
