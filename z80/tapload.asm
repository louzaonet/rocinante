; SPDX-License-Identifier: MIT-0
; tapload: cargador de cinta para las partidas DAAD que exporta Rocinante.
; Parte de Rocinante - licencia MIT-0 (va dentro de los juegos exportados; ver LICENSE).
;
; El programa BASIC hace CLEAR 24063: LOAD ""CODE: RANDOMIZE USR 24064 y este
; código (en 5E00h, por encima de RAMTOP) carga el resto de bloques sin
; cabecera con la rutina LD-BYTES de la ROM de 48K:
;   - el intérprete en 6000h, la base de datos en 8400h y el SDG al final de
;     la memoria (banco 0)
;   - en 128K, los bancos de datos 1, 3, 4, 6 y 7 en C000h
; Luego deja la máquina como la deja el cargador de DAAD y salta a 6000h.
;
; Detrás del código va la tabla de bloques (la rellena el exportador):
;   banco (FFh = fin), dirección (2 bytes), longitud (2 bytes)
; y tras el FFh final, el valor de 7FFDh con el que arranca el intérprete.
; En un 48K las escrituras en 7FFDh no hacen nada.

LDBYTES     equ 0556h
BANKM       equ 5B5Ch

            org 5E00h

start:      di
            ld a,(BANKM)
            ld (entry7ffd),a    ; para volver al BASIC si falla la carga
            ld hl,table
next:       ld a,(hl)
            cp 0FFh
            jr z,done
            inc hl
            or 10h              ; ROM de 48K (la de LD-BYTES)
            call page
            ld e,(hl)
            inc hl
            ld d,(hl)           ; DE = dirección
            inc hl
            push de
            ld e,(hl)
            inc hl
            ld d,(hl)           ; DE = longitud
            inc hl
            ex (sp),ix          ; IX = dirección (y guarda IX)
            push hl
            ld a,0FFh           ; bloque de datos
            scf                 ; cargar, no verificar
            call LDBYTES
            pop hl
            pop ix
            jr nc,fail
            di
            jr next

fail:       ld a,(entry7ffd)    ; vuelve al BASIC con "R Tape loading error"
            call page
            ei
            rst 8
            db 1Ah

done:       inc hl
            ld a,(hl)           ; 7FFDh final
            call page
            ld hl,5800h         ; atributos: blanco sobre negro
            ld de,5801h
            ld bc,767
            ld (hl),7
            ldir
            xor a
            out (0FEh),a        ; borde negro
            ld sp,5FE8h         ; como el cargador original
            ld iy,5C3Ah
            im 1
            ei
            jp 6000h

; Pagina según A y lo apunta en BANKM
page:       push bc
            ld (BANKM),a
            ld bc,7FFDh
            out (c),a
            pop bc
            ret

entry7ffd:  db 0
table:      ; la añade el exportador
