// Plantilla de juego nuevo en castellano: vocabulario básico, mensajes del
// sistema y los procesos que forman el bucle principal de DAAD (en DAAD el
// bucle del juego vive en la base de datos, no en el intérprete).

const V = (list, type) => list.trim().split('\n').map((l) => {
  const [word, value] = l.trim().split(/\s+/);
  return { word, value: +value, type };
});

export const SYSMSGS_ES = [
  'Está demasiado oscuro para ver nada.',       // 0
  'También hay aquí:',                          // 1
  '\n', '\n', '\n', '\n',                       // 2-5 antes de cada orden
  'No entiendo lo que quieres decir.\n',        // 6
  'No puedo ir por ahí.\n',                     // 7
  'No puedo hacer eso.\n',                      // 8
  'Llevo:\n',                                   // 9
  'Llevo puesto:\n',                            // 10
  '',                                           // 11
  '¿Seguro? ',                                  // 12
  '¿Quieres jugar otra vez? ',                  // 13
  '',                                           // 14
  'Vale.\n',                                    // 15
  'Pulsa una tecla.',                           // 16
  '', '', '', '', '', '',                       // 17-22 (libres)
  'No llevo puesto eso.\n',                     // 23
  'No puedo. Llevo puesto _.\n',                // 24
  'Ya tengo _.\n',                              // 25
  'No veo eso por aquí.\n',                     // 26
  'No puedo llevar nada más.\n',                // 27
  'No tengo eso.\n',                            // 28
  'Ya llevo puesto _.\n',                       // 29
  'S',                                          // 30 inicial de "sí"
  'N',                                          // 31 inicial de "no"
  'Hay más...',                                 // 32
  '>',                                          // 33
  '',                                           // 34
  '\nEl tiempo pasa...',                        // 35
  'Cojo _.\n',                                  // 36
  'Me pongo _.\n',                              // 37
  'Me quito _.\n',                              // 38
  'Dejo _.\n',                                  // 39
  'No puedo ponerme _.\n',                      // 40
  'No puedo quitarme _.\n',                     // 41
  'No puedo quitarme _, tengo las manos llenas.\n', // 42
  '@ pesa demasiado.\n',                        // 43
  '@ está en ',                                 // 44 (sigue el contenedor)
  '@ no está en ',                              // 45
  ', ',                                         // 46
  ' y ',                                        // 47
  '.\n',                                        // 48
  'No tengo _.\n',                              // 49
  'No llevo puesto _.\n',                       // 50
  '.\n',                                        // 51
  'No hay nada de eso en ',                     // 52
  'Nada.\n',                                    // 53
  'C',                                          // 54 inicial de "cinta"
  'D',                                          // 55 inicial de "disco"
  'La unidad no está lista. Pulsa una tecla.',  // 56
  'Error de lectura o escritura.',              // 57
  'El disco está lleno.',                       // 58
  'Ese nombre de fichero no vale.',             // 59
  'Nombre del fichero:',                        // 60
  'Pon la cinta en marcha.',                    // 61
  '¿Cinta o disco?',                            // 62
];

const VOCAB = [
  ...V(`
N 2
NORTE 2
S 3
SUR 3
E 4
ESTE 4
O 5
OESTE 5
NE 6
NORES 6
NO 7
NOROE 7
SE 8
SURES 8
SO 9
SUROE 9
SUBE 10
ARRIB 10
BAJA 11
ABAJO 11
DENTR 12
FUERA 13
I 14
INV 14
INVEN 14
TODO 20
TODOS 20
TODAS 20
LINTE 50`, 'noun'),
  ...V(`
SUBIR 10
BAJAR 11
ENTRA 12
SAL 13
SALIR 13
COGE 20
COGER 20
COGEL 20
TOMA 20
TOMAR 20
TOMAL 20
AGARR 20
DEJA 21
DEJAR 21
DEJAL 21
SUELT 21
QUITA 22
PONTE 23
PON 23
PONER 23
MIRA 24
MIRAR 24
M 24
L 24
FIN 25
ACABA 25
GRABA 26
GUARD 26
CARGA 27
RAMSA 28
RAMLO 29
EXAMI 30
EX 30
X 30
REGIS 30
HABLA 31
DI 31
DECIR 31
ABRE 32
ABRIR 32
CIERR 33
CERRA 33
METE 34
METER 34
SACA 35
SACAR 35
DA 36
DAR 36
LEE 37
LEER 37
EMPUJ 38
TIRA 39
TIRAR 39
ENCIE 40
ENCEN 40
APAGA 41
ROMPE 42
ROMPER 42
ESPER 43
AYUDA 44
PUNTO 45
TURNO 46`, 'verb'),
  ...V(`
VIEJO 2
VIEJA 2
NUEVO 3
NUEVA 3
GRAND 4
PEQUE 5`, 'adjective'),
  ...V(`
RAPID 2
DESPA 3`, 'adverb'),
  ...V(`
A 2
DE 3
EN 4
DENTR 5
CON 6
SOBRE 7
BAJO 8
DESDE 9
HACIA 10
MENOS 13
EXCEP 13`, 'preposition'),
  ...V(`
Y 2
LUEGO 2
DESPU 2
ENTON 2`, 'conjunction'),
  ...V(`
LO 2
LA 2
LOS 2
LAS 2`, 'pronoun'),
];
// DENTR es nombre (dirección) y preposición a la vez en castellano: nos
// quedamos con la dirección
const vocab = VOCAB.filter((w, i, a) => a.findIndex((x) => x.word.slice(0, 5) === w.word.slice(0, 5)) === i);

const P0 = `; Proceso principal. DAAD lo ejecuta al empezar y vuelve aquí con RESTART.
; Describe la localidad (con su dibujo) y pasa a esperar órdenes.
> _ _
    AT intro               ; la localidad 0 es la presentación
    PROCESS inicio
> _ _
    WINDOW 0
    CLEAR fDarkF
    NOTZERO fDark          ; si la bandera 0 dice que está oscuro...
    ABSENT linterna        ; ...y no hay luz (el objeto 0)
    SET fDarkF
> _ _
    PICTURE @fPlayer       ; dibujo de la localidad, si lo tiene
    DISPLAY @fDarkF
> _ _
    WINDOW 1
    NOTZERO fDarkF
    SYSMESS 0
> _ _
    ZERO fDarkF
    DESC @fPlayer
> _ _
    PROCESS tras_describir
> _ _
    PROCESS turno
`;

const P1 = `; Un turno: lee una frase, la cuenta y busca qué hacer con ella.
> _ _
    PROCESS cada_turno
> _ _
    PARSE 0                ; si no se entiende la frase...
    PROCESS no_entiendo
    REDO
> _ _
    EQ fTurns 255
    PLUS fTurnsHi 1
    CLEAR fTurns
    SKIP 1
> _ _
    PLUS fTurns 1
> _ _
    PROCESS respuestas
    ISDONE                 ; si alguna respuesta hizo algo, otra orden
    REDO
> _ _
    MOVE fPlayer           ; si no, a ver si es un movimiento
    RESTART
> _ _
    NEWTEXT
    LT fVerb 14
    SYSMESS 7
    REDO
> _ _
    SYSMESS 8
    REDO
`;

const P2 = `; La frase no se entiende (o se acabó el tiempo de espera).
> _ _
    HASAT TIMEOUT
    SYSMESS 35
    DONE
> _ _
    SYSMESS 6
`;

const P3 = `; Después de describir la localidad: los objetos que hay.
> _ _
    NEWLINE
    ZERO fDarkF
    LISTOBJ
`;

const P4 = `; Se ejecuta antes de cada orden: aquí van los sucesos que pasan solos.
`;

const P5 = `; Respuestas a las órdenes del jugador. Las más concretas, primero.
> I _
    SYSMESS 9
    LISTAT CARRIED
    SYSMESS 10
    LISTAT WORN
    DONE
> COGER TODO
    DOALL HERE
> COGER _
    AUTOG
    DONE
> DEJAR TODO
    DOALL CARRIED
> DEJAR _
    AUTOD
    DONE
> QUITA TODO
    DOALL WORN
> QUITA _
    AUTOR
    DONE
> PONER TODO
    DOALL CARRIED
> PONER _
    AUTOW
    DONE
> MIRAR _
    RESTART
> EXAMI _
    MESSAGE "No veo nada especial."
    DONE
> PUNTO _
    MES "Llevas "
    PRINT fScore
    MESSAGE " puntos."
    DONE
> TURNO _
    MES "Has dado "
    DPRINT fTurns
    MESSAGE " órdenes."
    DONE
> FIN _
    QUIT
    END
> FIN _
    DONE
> GRABA _
    SAVE 0
    RESTART
> CARGA _
    LOAD 0
    RESTART
> RAMSA _
    RAMSAVE
    MESSAGE "Partida guardada en memoria."
    DONE
> RAMLO _
    RAMLOAD 255
    RESTART
`;

const P6 = `; Inicio de la partida: ventanas, presentación y estado inicial.
> _ _
    WINDOW 1
    WINAT 12 0             ; el texto, de la línea 12 hacia abajo
    WINSIZE 12 42
    CLS
    DESC intro             ; la presentación
    ANYKEY
    CLS
    SET 255
> _ _
    MINUS 255 1            ; borra todas las banderas menos la 29
    NOTEQ 255 fGFlags
    CLEAR @255
> _ _
    NOTZERO 255
    SKIP -2
> _ _
    RESET                  ; objetos a su sitio inicial
    LET fStrength 10
    LET fMaxCarr 4
    SET fCPronounNoun
    SET fCPronounAdject
    GOTO entrada           ; primera localidad del juego
`;

import { SYSMSGS_EN, VOCAB_EN, PROCS_EN } from './template-en.js';

// Nombres de los procesos de la plantilla, en el orden de DAAD (0 a 6)
export const PROC_ROLES = {
  es: ['principal', 'turno', 'no_entiendo', 'tras_describir', 'cada_turno', 'respuestas', 'inicio'],
  en: ['main', 'turn', 'not_understood', 'after_describe', 'each_turn', 'responses', 'init'],
};

export function newProject(title, lang = 'es') {
  if (lang === 'en') return newProjectEN(title ?? 'My adventure');
  title ??= 'Mi aventura';
  return {
    format: 'rocinante-proyecto', version: 1,
    meta: { title, author: '', language: 'es', description: '' },
    settings: { machine: '128', textTop: 12 },
    vocab: vocab.map((w) => ({ ...w })),
    flags: [],
    defines: [],
    locations: [
      { id: 'intro', text: `${title.toUpperCase()}\n\nUna aventura escrita con Rocinante.\n`, exits: [] },
      { id: 'entrada', text: 'Estás en una habitación vacía. Hay una puerta al norte.', exits: [{ word: 'N', to: 'pasillo' }] },
      { id: 'pasillo', text: 'Un pasillo largo y oscuro. La habitación queda al sur.', exits: [{ word: 'S', to: 'entrada' }] },
    ],
    objects: [
      { id: 'linterna', text: 'Una linterna.', noun: 'LINTE', adj: '_', loc: 'pasillo', weight: 1, container: false, wearable: false, attrs: 0 },
    ],
    messages: [],
    sysmsgs: SYSMSGS_ES.slice(),
    processes: [
      { id: 'principal', source: P0 },
      { id: 'turno', source: P1 },
      { id: 'no_entiendo', source: P2 },
      { id: 'tras_describir', source: P3 },
      { id: 'cada_turno', source: P4 },
      { id: 'respuestas', source: P5 },
      { id: 'inicio', source: P6 },
    ],
    pictures: [],
  };
}

function newProjectEN(title) {
  const vocabEN = VOCAB_EN.filter((w, i, a) => a.findIndex((x) => x.word.slice(0, 5) === w.word.slice(0, 5)) === i);
  return {
    format: 'rocinante-proyecto', version: 1,
    meta: { title, author: '', language: 'en', description: '' },
    settings: { machine: '128', textTop: 12 },
    vocab: vocabEN.map((w) => ({ ...w })),
    flags: [],
    defines: [],
    locations: [
      { id: 'intro', text: `${title.toUpperCase()}\n\nAn adventure written with Rocinante.\n`, exits: [] },
      { id: 'start', text: 'You are in an empty room. There is a door to the north.', exits: [{ word: 'N', to: 'corridor' }] },
      { id: 'corridor', text: 'A long, dark corridor. The room is to the south.', exits: [{ word: 'S', to: 'start' }] },
    ],
    objects: [
      { id: 'torch', text: 'A torch.', noun: 'TORCH', adj: '_', loc: 'corridor', weight: 1, container: false, wearable: false, attrs: 0 },
    ],
    messages: [],
    sysmsgs: SYSMSGS_EN.slice(),
    processes: PROC_ROLES.en.map((id) => ({ id, source: PROCS_EN[id] })),
    pictures: [],
  };
}
