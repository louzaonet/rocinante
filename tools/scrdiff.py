"""Dibuja dos pantallas de Spectrum (6912 bytes) una encima de otra y marca en
rojo los bytes distintos. Uso: scrdiff.py a.bin b.bin salida.png"""
import sys
from PIL import Image
P=[(0,0,0),(0,0,0xd7),(0xd7,0,0),(0xd7,0,0xd7),(0,0xd7,0),(0,0xd7,0xd7),(0xd7,0xd7,0),(0xd7,0xd7,0xd7)]
B=[(0,0,0),(0,0,255),(255,0,0),(255,0,255),(0,255,0),(0,255,255),(255,255,0),(255,255,255)]
def draw(m, im, oy, other=None):
    px=im.load(); diffs=0
    for y in range(192):
        a=((y&0xC0)<<5)|((y&7)<<8)|((y&0x38)<<2)
        for cx in range(32):
            b=m[a+cx]; at=m[6144+(y>>3)*32+cx]
            pal=B if at&64 else P; ink=pal[at&7]; pap=pal[(at>>3)&7]
            bad = other is not None and (other[a+cx]!=b or other[6144+(y>>3)*32+cx]!=at)
            diffs+=bad
            for bit in range(8):
                c = ink if b&(128>>bit) else pap
                if bad: c=(255,0,0) if b&(128>>bit) else (90,0,0)
                px[cx*8+bit,y+oy]=c
    return diffs
a=open(sys.argv[1],'rb').read(); b=open(sys.argv[2],'rb').read()
im=Image.new('RGB',(256,192*2+4),(60,60,60))
draw(a,im,0,b); n=draw(b,im,196,a)
im.resize((512,(192*2+4)*2),Image.NEAREST).save(sys.argv[3]); print('bytes distintos:',n)
