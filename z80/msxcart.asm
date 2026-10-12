; SPDX-License-Identifier: MIT-0
; msxcart: arranque del cartucho de MSX para el intérprete DAAD.
; Parte de Rocinante - licencia MIT-0 (va dentro de los juegos exportados; ver LICENSE).
;
; Hace lo que en un disco hacía LOADMSX1.COM bajo MSX-DOS, pero sin DOS: deja
; RAM en las cuatro páginas y copia de la ROM a la RAM la base de datos
; (0100h), los gráficos (acaban en B000h), el intérprete (B000h, ya parcheado
; como lo parcheaba el cargador original) y los ganchos de cambio de slot.
;
; Cartucho ASCII16: dos ventanas de 16 KB, 4000h-7FFFh (banco en 6000h) y
; 8000h-BFFFh (banco en 7000h). El banco 0 está en 4000h al arrancar.
;
; Detrás de este código van, puestos por Rocinante:
;   el copiador (msxmover.asm, MOVERLEN bytes, se ejecuta en 0000h)
;   la tabla de trozos (ver msxmover.asm), que se copia a TABLE_RAM
;
; Se ensambla con --equ MOVERLEN=n.

EXPTBL      equ 0FCC1h      ; slots expandidos (bit 7) por slot primario
SLTTBL      equ 0FCC5h      ; registro de subslot de cada slot primario
VARS        equ 0E000h      ; variables del copiador (en la página 3)
RAMSLT      equ VARS        ; slot de la RAM (formato E000SSPP)
CARTSLT     equ VARS+1      ; slot del cartucho
TABLE_RAM   equ VARS+2      ; copia de la tabla de trozos
SLOTS_VARS  equ VARS+3FEh   ; valores de A8h para el intérprete (ver abajo)
RAMAD0      equ 0F341h      ; slot de la RAM de la página 0 (los ganchos lo leen)
FORCLR      equ 0F3E9h      ; colores de tinta, papel y borde

            org 4000h
            db "AB"
            dw init
            dw 0, 0, 0, 0, 0, 0

init:       di
            ; slot del cartucho (página 1) y de la RAM (página 3)
            ld b,2
            call slotof
            ld (CARTSLT),a
            ld b,6
            call slotof
            ld (RAMSLT),a
            ld (RAMAD0),a
            ; valores de A8h que usa el intérprete: BIOS en las páginas 0 y 1
            ; y RAM en la 2 y la 3; RAM en todas
            and 3
            ld c,a                  ; primario de la RAM
            ld a,(EXPTBL)
            and 3                   ; primario de la BIOS
            ld b,a
            rlca
            rlca
            or b
            ld b,a
            ld a,c
            rlca
            rlca
            or c
            ld e,a
            rlca
            rlca
            rlca
            rlca
            ld d,a
            or b
            ld (SLOTS_VARS),a
            ld a,d
            or e
            ld (SLOTS_VARS+1),a
            ; colores: tinta blanca, papel y borde negros
            ld hl,FORCLR
            ld (hl),15
            inc hl
            ld (hl),1
            inc hl
            ld (hl),1
            ; la tabla, a la página 3
            ld hl,table
            ld de,TABLE_RAM
            ld bc,512
            ldir
            ; RAM en la página 0 (desde aquí ya no hay BIOS)
            ld a,(RAMSLT)
            call setp0
            ; el copiador, a 0000h (antes de la base de datos, que va en
            ; 0100h), y la pila en la página 3
            ld hl,mover
            ld de,0
            ld bc,MOVERLEN
            ldir
            ld sp,0E800h
            jp 0

; Slot de una página. B = posición de sus bits en A8h (2 * página).
; Devuelve el slot en formato E000SSPP.
slotof:     in a,(0A8h)
            call rotr
            and 3
            ld c,a                  ; primario
            ld hl,EXPTBL
            ld e,a
            ld d,0
            add hl,de
            ld a,(hl)
            and 80h
            jr z,slotof1
            or c
            ld c,a
            inc hl
            inc hl
            inc hl
            inc hl                  ; SLTTBL del mismo primario
            ld a,(hl)
            call rotr
            and 3
            rlca
            rlca
            or c
slotof1:    or c
            ret
rotr:       inc b
            dec b
            ret z
            push bc
rotr1:      rrca
            djnz rotr1
            pop bc
            ret

; Página 0 al slot A (E000SSPP). Corre en la página 1 y no usa la pila
; mientras la página 3 está cambiada.
setp0:      ld c,a
            in a,(0A8h)
            and 0FCh
            ld d,a
            ld a,c
            and 3
            or d
            ld d,a                  ; A8h con la página 0 en el primario
            bit 7,c
            jr z,setp0b
            ; expandido: el registro de subslot (FFFFh) del primario se ve
            ; poniendo la página 3 en ese primario
            ld a,c
            rrca
            rrca
            and 0C0h
            ld e,a
            ld a,d
            and 3Fh
            or e
            out (0A8h),a
            ld a,(0FFFFh)
            cpl
            and 0FCh
            ld e,a
            ld a,c
            rrca
            rrca
            and 3
            or e
            ld (0FFFFh),a
setp0b:     ld a,d
            out (0A8h),a
            ret

mover:
table       equ mover + MOVERLEN
