from PIL import Image
P=[(0,0,0),(0,0,0xd7),(0xd7,0,0),(0xd7,0,0xd7),(0,0xd7,0),(0,0xd7,0xd7),(0xd7,0xd7,0),(0xd7,0xd7,0xd7)]
B=[(0,0,0),(0,0,255),(255,0,0),(255,0,255),(0,255,0),(0,255,255),(255,255,0),(255,255,255)]
def png(m,path,scale=2):
    im=Image.new('RGB',(256,192))
    px=im.load()
    for y in range(192):
        a=0x4000|((y&0xC0)<<5)|((y&7)<<8)|((y&0x38)<<2)
        for cx in range(32):
            b=m[a+cx]; at=m[0x5800+(y>>3)*32+cx]
            pal=B if at&64 else P; ink=pal[at&7]; pap=pal[(at>>3)&7]
            for bit in range(8): px[cx*8+bit,y]= ink if b&(128>>bit) else pap
    im.resize((512,384),Image.NEAREST).save(path)
