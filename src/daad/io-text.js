// E/S de texto para pruebas: acumula la salida en una cadena con el mismo
// formato que tools/zxdaad.py (órdenes entre «», {key} en cada espera de tecla).
export class TextIO {
  constructor(commands) {
    this.commands = [...commands];
    this.out = '';
  }
  async print(s) {
    for (const ch of s) {
      if (ch === '\x0c') { this.out += '{0c}{key}'; continue; }
      const c = ch.charCodeAt(0);
      if (c < 32 && ch !== '\n') { this.out += '{' + c.toString(16).padStart(2, '0') + '}'; continue; }
      this.out += ch;
    }
  }
  async input() {
    if (!this.commands.length) throw new EndOfScript();
    const c = this.commands.shift();
    this.out += '«' + c + '»';
    return c;
  }
  async anykey() { this.out += '{key}'; }
}
export class EndOfScript extends Error {}
