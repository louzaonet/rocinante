"""Lee un .wav de cinta de Spectrum y saca sus bloques (como la rutina de
carga de la ROM: tono guía, sincronismo y bits por la duración de los pulsos).
Lo usan las pruebas para comprobar el audio que genera Rocinante.
Uso: wavread.py cinta.wav  (escribe los bloques en formato .tap por la salida)"""
import sys, wave

CLOCK = 3500000

def pulses(path):
    w = wave.open(path, 'rb')
    rate, width = w.getframerate(), w.getsampwidth()
    data = w.readframes(w.getnframes())
    if width != 1: raise SystemExit('Solo PCM de 8 bits')
    k = CLOCK / rate
    out, last, prev = [], 0, data[0] >= 128
    for i, b in enumerate(data):
        cur = b >= 128
        if cur != prev:
            out.append((i - last) * k); last = i; prev = cur
    return out

def blocks(ps):
    res, i, n = [], 0, len(ps)
    while i < n:
        # tono guía: muchos pulsos de unos 2168 T
        j = i
        while j < n and 1700 < ps[j] < 2700: j += 1
        if j - i < 256: i = j + 1; continue
        # sincronismo: dos pulsos cortos
        if j + 1 >= n or not (ps[j] < 1100 and ps[j + 1] < 1100): i = j + 1; continue
        j += 2
        bits = []
        while j + 1 < n and ps[j] < 2200 and ps[j + 1] < 2200:
            pair = ps[j] + ps[j + 1]
            bits.append(1 if pair > 2565 else 0)
            j += 2
        data = bytes(int(''.join(map(str, bits[k:k + 8])), 2) for k in range(0, len(bits) - len(bits) % 8, 8))
        res.append(data)
        i = j
    return res

if __name__ == '__main__':
    for b in blocks(pulses(sys.argv[1])):
        sys.stdout.buffer.write(bytes([len(b) & 255, len(b) >> 8]) + b)

def to_tzx(wav_path, tzx_path):
    """Mete el audio tal cual en un .tzx (bloque 15h, grabación directa) para
    que tap2sna lo cargue con la rutina de la ROM, flanco a flanco."""
    w = wave.open(wav_path, 'rb')
    d = w.readframes(w.getnframes())
    bits = bytearray((len(d) + 7) // 8)
    for i, b in enumerate(d):
        if b >= 128: bits[i >> 3] |= 0x80 >> (i & 7)
    used = len(d) % 8 or 8
    tps = round(CLOCK / w.getframerate())
    n = len(bits)
    blk = bytes([0x15, tps & 255, tps >> 8, 0, 0, used, n & 255, (n >> 8) & 255, n >> 16]) + bits
    open(tzx_path, 'wb').write(b'ZXTape!\x1a\x01\x14' + blk)
