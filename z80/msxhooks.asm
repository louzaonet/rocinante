; SPDX-License-Identifier: MIT-0
; msxhooks: los dos ganchos que el intérprete DAAD de MSX llama para tener
; la BIOS o la RAM en la página 0 (el cargador original los dejaba en 8252h y
; 8263h), y la rutina de interrupción a la que salta 0038h cuando la página 0
; es RAM (bajo MSX-DOS la ponía el sistema). Se copian a la página 1 o 2, en
; la dirección que elija Rocinante (tools/genz80.mjs saca la lista de
; direcciones que hay que recolocar).
; Parte de Rocinante - licencia MIT-0 (va dentro de los juegos exportados; ver LICENSE).
;
; Se ensambla con --equ FLAG=n: la variable del intérprete que dice qué hay en
; la página 0 (0 la BIOS, FFh la RAM): D053h en MSXSDI, CFBEh en MSXEDI.

EXPTBL      equ 0FCC1h      ; slot de la BIOS
RAMAD0      equ 0F341h      ; slot de la RAM de la página 0

            org BASE
tobios:     push hl
            push de
            push bc
            ld a,(EXPTBL)
            ld b,0
            jr setp0
toram:      push hl
            push de
            push bc
            ld a,(RAMAD0)
            ld b,0FFh
; Página 0 al slot A (E000SSPP); si es expandido, pone su subslot pasando un
; momento la página 3 a ese primario (por eso este código no puede estar en
; las páginas 0 ni 3)
setp0:      di
            ld c,a
            in a,(0A8h)
            and 0FCh
            ld d,a
            ld a,c
            and 3
            or d
            ld d,a
            out (0A8h),a
            bit 7,c
            jr z,setp0b
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
            ld a,d
            out (0A8h),a
setp0b:     ld a,b
            ld (FLAG),a
            pop bc
            pop de
            pop hl
            ret

; Interrupción con RAM en la página 0: la de la BIOS (teclado, reloj), con la
; BIOS puesta un momento, y se deja todo como estaba
irq:        push af
            push bc
            push de
            push hl
            ld a,(FLAG)
            push af
            call tobios
            call 0038h              ; acaba con EI
            di
            call toram
            pop af
            ld (FLAG),a
            pop hl
            pop de
            pop bc
            pop af
            ei
            ret
