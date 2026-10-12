; SPDX-License-Identifier: MIT-0
; xbank: extensión de DAAD para el Spectrum.
; En 128K (MODE48=0): textos y dibujos en mapa de bits guardados en los bancos
; de memoria 1,3,4,6,7.
; En 48K (MODE48=1): solo los dibujos, guardados en la memoria principal justo
; detrás de este código (tabla de 2 bytes por dibujo, 0 si no está, y datos).
; Parte de Rocinante - licencia MIT-0 (va dentro de los juegos exportados; ver LICENSE).
;
; Se invoca con EXTERN valor función. Al entrar:
;   A  = valor (con la indirección ya resuelta por el intérprete)
;   BC = apunta al segundo parámetro (la función) dentro del condacto
;   IX = banderas del intérprete (7F1Ch en DS48IS, 7E55h en DS48IE)
; Funciones:
;   0  MES n      mensaje n de los bancos, sin salto de línea
;   1  MESSAGE n  igual, con salto de línea
;   2  DESC n     texto de la localidad n
;   3  dibujo     en lugar de DISPLAY v: dibuja el dibujo del último PICTURE
;                 (en mapa de bits, en los bancos) o, si v<>0, borra su zona.
;                 Si ese dibujo no es un mapa de bits (es vectorial, en el SDG),
;                 sigue en la rutina de DISPLAY del intérprete, como si el
;                 condacto hubiera sido DISPLAY v.
;
; Directorio (banco 1, desde C200h): tres tablas de 256 entradas de 3 bytes
; (banco, dirección) para mensajes, localidades y dibujos. Los primeros 200h
; bytes del banco 1 son del intérprete: en un 128K, RAMSAVE guarda ahí las
; banderas y los objetos (en 48K lo hace en 8200h, que en 128K ocupa la tabla
; de interrupciones).
; Los textos se guardan igual que en el DDB (XOR FFh, tokens, fin en F5h).

BANKM       equ 5B5Ch       ; copia del último valor enviado a 7FFDh
; Direcciones del intérprete: DS48IS (español) o DS48IE (inglés).
; Se ensambla con --equ LANG_EN=0|1 --equ MODE48=0|1.
            if LANG_EN
PRINTTEXT   equ 6D9Dh       ; DS48IE: imprime el texto que empieza en HL
LASTPIC     equ 7D8Ah       ; DS48IE: número del último PICTURE
DISPLAYH    equ 6DFCh       ; DS48IE: rutina del condacto DISPLAY
            else
PRINTTEXT   equ 6DF1h       ; DS48IS: imprime el texto que empieza en HL
LASTPIC     equ 7E4Fh       ; DS48IS: número del último PICTURE
DISPLAYH    equ 6E5Ch       ; DS48IS: rutina del condacto DISPLAY
            endif
DIRBANK     equ 1
MSGIDX      equ 0C200h
LOCIDX      equ 0C500h
PICIDX      equ 0C800h
TEXTEND     equ 0F5h        ; 0Ah XOR FFh

            org 843Ch

start:      push bc
            ld e,a              ; E = número de texto
            ld a,(bc)           ; A = función
            if MODE48
            cp 3
            jr z,picture
            pop bc              ; en 48K solo hay dibujos
            ret
            else
            cp 3
            jp z,picture
            ld d,a              ; D = función
            ld hl,MSGIDX
            cp 2
            jr nz,idx_ok
            ld hl,LOCIDX
idx_ok:     ld a,(BANKM)
            ld (saved_bankm),a
            push de
            ld d,0
            add hl,de           ; HL = tabla + 3*n
            add hl,de
            add hl,de
            di
            ld a,DIRBANK
            call page
            ld a,(hl)           ; banco del texto
            inc hl
            ld e,(hl)
            inc hl
            ld d,(hl)           ; DE = dirección del texto
            call page
            ex de,hl
            ld de,tail
copy:       ld a,(hl)
            ld (de),a
            inc hl
            inc de
            cp TEXTEND
            jr nz,copy
            ld a,(saved_bankm)  ; vuelve el banco que hubiera (el 0)
            ld bc,7FFDh
            ld (BANKM),a
            out (c),a
            ei
            pop de
            ld a,d
            cp 1
            jr nz,print
            set 6,(ix-1)        ; como MESSAGE: salto de línea al terminar
print:      ld hl,tail
            call PRINTTEXT
            pop bc
            ret

; Pagina el banco A en C000h conservando el resto de bits de BANKM.
page:       push bc
            ld c,a
            ld a,(BANKM)
            and 0F8h
            or c
            ld (BANKM),a
            ld bc,7FFDh
            out (c),a
            pop bc
            ret

            endif

; ---------------------------------------------------------------- dibujos
; E = valor de DISPLAY (0: dibujar; otro: solo borrar)
            if MODE48
picture:    push de
            ld a,(LASTPIC)
            ld l,a
            ld h,0
            add hl,hl
            ld de,tail          ; tabla de dibujos
            add hl,de
            ld e,(hl)
            inc hl
            ld d,(hl)
            pop bc              ; C = valor de DISPLAY
            ld a,d
            or e
            jr z,vector         ; no es mapa de bits (o no cabía)
            ex de,hl
            call pic_draw
            pop bc
            ret
            else
picture:    ld a,(BANKM)
            ld (saved_bankm),a
            push de
            ld a,(LASTPIC)
            ld l,a
            ld h,0
            ld d,h
            ld e,l
            add hl,hl
            add hl,de
            ld de,PICIDX
            add hl,de
            di
            ld a,DIRBANK
            call page
            ld a,(hl)
            inc hl
            ld e,(hl)
            inc hl
            ld d,(hl)
            pop bc              ; C = valor de DISPLAY
            cp 0FFh
            jr z,pic_none       ; ese dibujo no está en los bancos
            call page
            ex de,hl            ; HL = datos del dibujo
            call pic_draw
            call restore
            pop bc
            ret
pic_none:   call restore
            jr vector
restore:    push bc
            ld a,(saved_bankm)
            ld bc,7FFDh
            ld (BANKM),a
            out (c),a
            pop bc
            ei
            ret
            endif

; Dibujo vectorial: se sigue en la rutina de DISPLAY con el valor en A, el
; puntero del condacto en BC y sin la vuelta al manejador de EXTERN; al acabar,
; DISPLAY pasa al condacto siguiente igual que lo haría EXTERN.
vector:     ld a,c
            pop bc
            pop hl
            jp DISPLAYH

; HL = dibujo (columna, fila, ancho, alto y flujo comprimido); C = valor de DISPLAY
pic_draw:   ld a,(hl)
            ld (pcx),a
            inc hl
            ld a,(hl)
            ld (pcy),a
            inc hl
            ld a,(hl)
            ld (pcw),a
            inc hl
            ld a,(hl)
            ld (pch),a
            inc hl
            ld a,c
            ld (clearing),a
            jp unpack

; Filas de píxeles y luego de atributos; HL = flujo comprimido
unpack:     ld a,(pcy)
            add a,a
            add a,a
            add a,a
            ld (py),a
            ld a,(pch)
            add a,a
            add a,a
            add a,a
            ld b,a
prow:       push bc
            ld a,(py)
            call rowaddr
            call unrow
            ld a,(py)
            inc a
            ld (py),a
            pop bc
            djnz prow
            ld a,(pcy)
            ld (py),a
            ld a,(pch)
            ld b,a
arow:       push bc
            ld a,(py)
            push hl
            ld l,a
            ld h,0
            add hl,hl
            add hl,hl
            add hl,hl
            add hl,hl
            add hl,hl
            ld de,5800h
            add hl,de
            ld a,(pcx)
            ld e,a
            ld d,0
            add hl,de
            ex de,hl
            pop hl
            call unrow
            ld a,(py)
            inc a
            ld (py),a
            pop bc
            djnz arow
            ret

; A = fila de píxeles -> DE = dirección de pantalla + columna
rowaddr:    ld c,a
            and 7
            ld d,a
            ld a,c
            and 0C0h
            rrca
            rrca
            rrca
            or d
            or 40h
            ld d,a
            ld a,c
            and 38h
            rlca
            rlca
            ld e,a
            ld a,(pcx)
            add a,e
            ld e,a
            ret

; Una fila: (pcw) bytes desde HL hacia DE. Si (clearing)<>0 escribe ceros
; (pero sigue leyendo el flujo para avanzar).
unrow:      ld a,(pcw)
            ld (left),a
ur1:        ld a,(hl)
            inc hl
            bit 7,a
            jr nz,urcopy
            inc a
            ld c,a
            ld b,0
            push af
            ld a,(clearing)
            or a
            jr nz,urskip
            ldir
            jr urlit
urskip:     add hl,bc
            call zeros
urlit:      pop af
            jr urnext
urcopy:     and 7Fh
            add a,2
            push af
            ld c,(hl)
            inc hl
            ld b,(hl)
            inc hl
            push hl
            ld h,b
            ld l,c
            ld c,a
            ld b,0
            ld a,(clearing)
            or a
            jr nz,urz
            ldir
            jr urc
urz:        call zeros
urc:        pop hl
            pop af
urnext:     ld c,a
            ld a,(left)
            sub c
            ld (left),a
            jr nz,ur1
            ret

; C bytes a cero desde DE (B=0)
zeros:      xor a
z1:         ld (de),a
            inc de
            dec c
            jr nz,z1
            ret

pcx:        db 0
pcy:        db 0
pcw:        db 0
pch:        db 0
py:         db 0
left:       db 0
clearing:   db 0
saved_bankm: db 0
tail:       ; 128K: el generador añade aquí un búfer tan largo como el texto más largo
            ; 48K: la tabla de dibujos y sus datos
