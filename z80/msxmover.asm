; SPDX-License-Identifier: MIT-0
; msxmover: copiador del cartucho de MSX (ver msxcart.asm). Se ejecuta en
; 0000h, en la RAM de la página 0 (tiene que caber antes de 0100h, donde va la
; base de datos), con la pila en la página 3. Copia los
; trozos de la tabla de la ROM a la RAM, deja RAM en las cuatro páginas y
; arranca el intérprete.
; Parte de Rocinante - licencia MIT-0 (va dentro de los juegos exportados; ver LICENSE).
;
; Tabla (en TABLE_RAM):
;   dw arranque del intérprete
;   dw pila
;   dw rutina de interrupción (0038h salta a ella cuando acaba la copia)
;   por trozo: db banco; dw origen (0-3FFFh dentro del banco); dw destino;
;              dw longitud. Acaba con longitud 0.
;   Ningún trozo cruza un banco de la ROM ni una página de la RAM.

VARS        equ 0E000h
RAMSLT      equ VARS
CARTSLT     equ VARS+1
TABLE_RAM   equ VARS+2
SLOTS_VARS  equ VARS+3FEh   ; los dos valores de A8h, calculados por el arranque
SLOTS_BIOS  equ 0B008h      ; valores de A8h que usa el intérprete: BIOS abajo
                            ;   y RAM arriba (B008h); todo RAM (B009h)

            org 0
start:      di
            ld a,(RAMSLT)
            ld b,2
            call setpg
            ld ix,TABLE_RAM+6
next:       ld a,(ix+5)
            or (ix+6)
            jr z,done
            ld a,(ix+4)
            and 0C0h
            cp 40h
            jr z,topage1
            ; destino en las páginas 0, 2 o 3: la ROM se ve en 4000h
            ld a,(CARTSLT)
            ld b,1
            call setpg
            ld a,(ix+0)
            ld (6000h),a
            ld a,40h
            call copy
            jr piece
            ; destino en la página 1: la ROM se ve en 8000h
topage1:    ld a,(CARTSLT)
            ld b,1
            call setpg
            ld a,(ix+0)
            ld (7000h),a
            ld a,(CARTSLT)
            ld b,2
            call setpg
            ld a,(RAMSLT)
            ld b,1
            call setpg
            ld a,80h
            call copy
            ld a,(RAMSLT)
            ld b,2
            call setpg
piece:      ld de,7
            add ix,de
            jr next

done:       ld a,(RAMSLT)
            ld b,1
            call setpg
            ; valores de A8h para el intérprete (los calcula el arranque)
            ld hl,(SLOTS_VARS)
            ld (SLOTS_BIOS),hl
            ; interrupciones con RAM en la página 0
            ld a,0C3h
            ld (0038h),a
            ld hl,(TABLE_RAM+4)
            ld (0039h),hl
            ld sp,(TABLE_RAM+2)
            ld hl,(TABLE_RAM)
            jp (hl)

; Copia el trozo de IX; A = página de la ventana de la ROM (40h u 80h)
copy:       ld l,(ix+1)
            ld h,(ix+2)
            or h
            ld h,a
            ld e,(ix+3)
            ld d,(ix+4)
            ld c,(ix+5)
            ld b,(ix+6)
            ldir
            ret

; Página B (1 o 2) al slot A (E000SSPP). Se ejecuta en la página 0: puede
; cambiar un momento la página 3 para llegar al registro de subslot.
setpg:      ld c,a
            ld a,3
            call rot
            cpl
            ld l,a                  ; máscara: lo que no es de la página
            ld a,c
            and 3
            call rot
            ld e,a                  ; primario en su sitio
            in a,(0A8h)
            and l
            or e
            ld d,a
            bit 7,c
            jr z,setpg1
            ld a,c
            rrca
            rrca
            and 3
            call rot
            ld e,a                  ; subslot en su sitio
            ld a,c
            rrca
            rrca
            and 0C0h
            ld h,a
            ld a,d
            and 3Fh
            or h
            out (0A8h),a            ; página 3 en ese primario
            ld a,(0FFFFh)
            cpl
            and l
            or e
            ld (0FFFFh),a
setpg1:     ld a,d
            out (0A8h),a
            ret
; A girado a la izquierda 2*B veces
rot:        push bc
rot1:       rlca
            rlca
            djnz rot1
            pop bc
            ret
