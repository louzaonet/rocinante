// New game template in English, for the DS48IE interpreter. Same structure as
// the Spanish one (template.js): basic vocabulary, system messages and the
// processes that make up the DAAD main loop.
//
// DS48IE prints _ as the object text up to the first full stop without its
// first word ("A brass lamp. It is lit" -> "brass lamp"), so the messages say
// "the _". There is no @ in English.

const V = (list, type) => list.trim().split('\n').map((l) => {
  const [word, value] = l.trim().split(/\s+/);
  return { word, value: +value, type };
});

export const SYSMSGS_EN = [
  "It's too dark to see anything.",             // 0
  'I can also see:',                            // 1
  '\n', '\n', '\n', '\n',                       // 2-5 before each command
  "I don't understand.\n",                      // 6
  "I can't go that way.\n",                     // 7
  "I can't do that.\n",                         // 8
  "I'm carrying:\n",                            // 9
  "I'm wearing:\n",                             // 10
  '',                                           // 11
  'Are you sure? ',                             // 12
  'Would you like to play again? ',             // 13
  '',                                           // 14
  'OK.\n',                                      // 15
  'Press any key.',                             // 16
  '', '', '', '', '', '',                       // 17-22 (free)
  "I'm not wearing that.\n",                    // 23
  "I can't. I'm wearing the _.\n",              // 24
  'I already have the _.\n',                    // 25
  "I can't see that here.\n",                   // 26
  "I can't carry any more.\n",                  // 27
  "I don't have that.\n",                       // 28
  "I'm already wearing the _.\n",               // 29
  'Y',                                          // 30 first letter of "yes"
  'N',                                          // 31 first letter of "no"
  'More...',                                    // 32
  '>',                                          // 33
  '',                                           // 34
  '\nTime passes...',                           // 35
  'I take the _.\n',                            // 36
  "I'm now wearing the _.\n",                   // 37
  'I take off the _.\n',                        // 38
  'I drop the _.\n',                            // 39
  "I can't wear the _.\n",                      // 40
  "I can't take off the _.\n",                  // 41
  "I can't take off the _, my hands are full.\n", // 42
  'The _ is too heavy.\n',                      // 43
  'The _ is in the',                            // 44
  "The _ isn't in the",                         // 45
  ', ',                                         // 46
  ' and ',                                      // 47
  '.\n',                                        // 48
  "I don't have the _.\n",                      // 49
  "I'm not wearing the _.\n",                   // 50
  '.\n',                                        // 51
  "There isn't one of those in the",            // 52
  'Nothing.\n',                                 // 53
  'T',                                          // 54 first letter of "tape"
  'D',                                          // 55 first letter of "disc"
  'Drive not ready. Press any key.',            // 56
  'Read or write error.',                       // 57
  'The disc is full.',                          // 58
  'Invalid file name.',                         // 59
  'File name:',                                 // 60
  'Start the tape.',                            // 61
  'Tape or disc?',                              // 62
];

// Words are matched on their first five letters, so NORTHEAST would be NORTH:
// the diagonals are only NE, NW, SE and SW.
export const VOCAB_EN = [
  ...V(`
N 2
NORTH 2
S 3
SOUTH 3
E 4
EAST 4
W 5
WEST 5
NE 6
NW 7
SE 8
SW 9
U 10
UP 10
D 11
DOWN 11
I 14
INV 14
INVEN 14
ALL 20
EVERY 20
TORCH 50`, 'noun'),
  ...V(`
CLIMB 10
ASCEN 10
DESCE 11
ENTER 12
EXIT 13
LEAVE 13
GET 20
TAKE 20
PICK 20
DROP 21
REMOV 22
WEAR 23
LOOK 24
L 24
R 24
REDES 24
QUIT 25
Q 25
SAVE 26
LOAD 27
RAMSA 28
RAMLO 29
EXAMI 30
X 30
SEARC 30
SAY 31
TALK 31
SPEAK 31
ASK 31
OPEN 32
CLOSE 33
SHUT 33
PUT 34
INSER 34
EMPTY 35
GIVE 36
OFFER 36
READ 37
PUSH 38
PRESS 38
PULL 39
LIGHT 40
EXTIN 41
BREAK 42
SMASH 42
WAIT 43
Z 43
HELP 44
SCORE 45
TURNS 46`, 'verb'),
  ...V(`
OLD 2
NEW 3
BIG 4
LARGE 4
SMALL 5
LITTL 5`, 'adjective'),
  ...V(`
QUICK 2
SLOWL 3`, 'adverb'),
  ...V(`
TO 2
FROM 3
IN 4
INTO 4
INSID 4
OUT 5
WITH 6
ON 7
ONTO 7
UNDER 8
BY 9
TOWAR 10
EXCEP 13
BUT 13`, 'preposition'),
  ...V(`
AND 2
THEN 2`, 'conjunction'),
  ...V(`
IT 2
THEM 2
HIM 2
HER 2`, 'pronoun'),
];

export const PROCS_EN = {
  main: `; Main process. DAAD runs it at the start and comes back here on RESTART.
; Describes the location (with its picture) and goes on to read commands.
> _ _
    AT intro               ; location 0 is the title screen
    PROCESS init
> _ _
    WINDOW 0
    CLEAR fDarkF
    NOTZERO fDark          ; if flag 0 says it is dark...
    ABSENT torch           ; ...and there is no light (object 0)
    SET fDarkF
> _ _
    PICTURE @fPlayer       ; the location picture, if it has one
    DISPLAY @fDarkF
> _ _
    WINDOW 1
    NOTZERO fDarkF
    SYSMESS 0
> _ _
    ZERO fDarkF
    DESC @fPlayer
> _ _
    PROCESS after_describe
> _ _
    PROCESS turn
`,
  turn: `; One turn: read a phrase, count it and find what to do with it.
> _ _
    PROCESS each_turn
> _ _
    PARSE 0                ; if the phrase is not understood...
    PROCESS not_understood
    REDO
> _ _
    EQ fTurns 255
    PLUS fTurnsHi 1
    CLEAR fTurns
    SKIP 1
> _ _
    PLUS fTurns 1
> _ _
    PROCESS responses
    ISDONE                 ; if a response did something, next command
    REDO
> _ _
    MOVE fPlayer           ; if not, maybe it is a movement
    RESTART
> _ _
    NEWTEXT
    LT fVerb 14
    SYSMESS 7
    REDO
> _ _
    SYSMESS 8
    REDO
`,
  not_understood: `; The phrase was not understood (or the input timed out).
> _ _
    HASAT TIMEOUT
    SYSMESS 35
    DONE
> _ _
    SYSMESS 6
`,
  after_describe: `; After describing the location: the objects that are here.
> _ _
    NEWLINE
    ZERO fDarkF
    LISTOBJ
`,
  each_turn: `; Runs before every command: things that happen on their own go here.
`,
  responses: `; Responses to the player's commands. The most specific ones first.
> I _
    SYSMESS 9
    LISTAT CARRIED
    SYSMESS 10
    LISTAT WORN
    DONE
> GET ALL
    DOALL HERE
> GET _
    AUTOG
    DONE
> DROP ALL
    DOALL CARRIED
> DROP _
    AUTOD
    DONE
> REMOV ALL
    DOALL WORN
> REMOV _
    AUTOR
    DONE
> WEAR ALL
    DOALL CARRIED
> WEAR _
    AUTOW
    DONE
> LOOK _
    RESTART
> EXAMI _
    MESSAGE "I see nothing special."
    DONE
> SCORE _
    MES "You have "
    PRINT fScore
    MESSAGE " points."
    DONE
> TURNS _
    MES "You have typed "
    DPRINT fTurns
    MESSAGE " commands."
    DONE
> QUIT _
    QUIT
    END
> QUIT _
    DONE
> SAVE _
    SAVE 0
    RESTART
> LOAD _
    LOAD 0
    RESTART
> RAMSA _
    RAMSAVE
    MESSAGE "Game saved in memory."
    DONE
> RAMLO _
    RAMLOAD 255
    RESTART
`,
  init: `; Game setup: windows, title screen and starting state.
> _ _
    WINDOW 1
    WINAT 12 0             ; text from line 12 down
    WINSIZE 12 42
    CLS
    DESC intro             ; the title screen
    ANYKEY
    CLS
    SET 255
> _ _
    MINUS 255 1            ; clear every flag except 29
    NOTEQ 255 fGFlags
    CLEAR @255
> _ _
    NOTZERO 255
    SKIP -2
> _ _
    RESET                  ; objects back to where they start
    LET fStrength 10
    LET fMaxCarr 4
    SET fCPronounNoun
    SET fCPronounAdject
    GOTO start             ; first location of the game
`,
};
