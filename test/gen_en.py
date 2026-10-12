"""Casos de prueba con la plantilla inglesa de DAAD y el intérprete DS48IE.
Los usa gen.py (python3 gen.py en_objects en_parser ...)."""

CASES_EN, CMDS_EN = {}, {}

# ---------------------------------------------------------------- objetos
CASES_EN['en_objects'] = dict(
    lang='en',
    init='                LET     42       2       ; petición de orden fija (SM2), para comparar pantallas',
    vocab="""BOOK    101 noun
BOOTS   102 noun
SACK    103 noun
COIN    104 noun
MAP     105 noun
GLOVE   106 noun
APPLE   107 noun
STONE   108 noun
INSER   40 verb
TAKEO   41 verb
X       30 verb
VASE    110 noun
TICKE   111 noun
HAT     112 noun
LETTE   113 noun
EMERA   114 noun
BELL    115 noun
COINS   116 noun
THING   117 noun
AB      118 noun
""",
    msgs=['You see _ and @ looks at you.', 'Ref: _.', 'Ref: @.'],
    objs=[
        ('A pocket torch. (lit)', '_ 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ TORCH _'),
        ('An old book', '1 2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ BOOK OLD'),
        ('Some boots', '1 2 _ Y _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ BOOTS _'),
        ('A sack', '1 1 Y _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ SACK _'),
        ('A gold coin', '3 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ COIN _'),
        ('The map', 'CARRIED 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ MAP _'),
        ('Some gloves. They are torn', 'WORN 1 _ Y _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ GLOVE _'),
        ('A new book', '1 2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ BOOK NEW'),
        ('an apple', '1 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ APPLE _'),
        ('Stone', '1 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ STONE _'),
        ('Ancient vase', '2 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ VASE _'),
        ('Theatre ticket', '2 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ TICKE _'),
        ("Someone's hat", '2 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ HAT _'),
        ('A', '2 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ LETTE _'),
        ('AN EMERALD', '2 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ EMERA _'),
        ('a  bell', '2 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ BELL _'),
        ('Two coins', '2 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ COINS _'),
        ('the Some thing', '2 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ THING _'),
        ('A.B.', '2 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ AB _'),
    ],
    locs=[('Intro.', ''), ('A dusty library.', 'S 2'), ('Square.', 'N 1'), ('', '')],
    pro5="""> INSER   _     AUTOP 3
                DONE
> TAKEO   _     AUTOT 3
                DONE
> LOOK    BOOK  LET 53 64
                LISTOBJ
                NEWLINE
                LISTAT CARRIED
                NEWLINE
                LET 53 0
                DONE
> EXAMI   _     WHATO
                MESSAGE 0
                MESSAGE 1
                MESSAGE 2
                DONE""",
)
CMDS_EN['en_objects'] = ['look', 'i', 'look book', 'get book', 'get old book', 'i', 'get all',
                         'i', 'look book', 'drop all', 'look', 'get boots', 'wear boots', 'i', 'remove boots',
                         'remove glove', 'get sack', 'inser map', 'takeo coin', 'takeo coin',
                         'x map', 'examine glove', 'examine new book', 'x apple', 'x stone', 'get torch',
                         's', 'look book', 'x vase', 'x ticket', 'x hat', 'x lette', 'x emerald', 'x bell', 'x coins',
                         'x thing', 'x ab', 'get hat', 'get ab', 'get lette', 'get bell', 'i', 'n',
                         'drop sack', 'get all', 'get all', 'i']

# ---------------------------------------------------------------- analizador
CASES_EN['en_parser'] = dict(
    lang='en',
    init='                LET     42       2       ; petición de orden fija (SM2), para comparar pantallas',
    vocab="""KEY     101 noun
DOOR    102 noun
JOHN    40  noun
COIN    104 noun
GOLDE   10  adjective
RED     11  adjective
OPEN    40  verb
GIVE    41  verb
TELL    42  verb
GO      43  verb
X       30  verb
""",
    pro5="""> _       _     MES 0
                PRINT 33
                SPACE
                PRINT 34
                SPACE
                PRINT 35
                SPACE
                PRINT 36
                SPACE
                PRINT 43
                SPACE
                PRINT 44
                SPACE
                PRINT 45
                SPACE
                PRINT 46
                SPACE
                PRINT 47
                NEWLINE
> TELL    JOHN  PARSE 1
                MESSAGE 1
                DONE
> TELL    JOHN  MES 2
                PRINT 33
                SPACE
                PRINT 34
                NEWLINE
                DONE""",
    msgs=['LS=', 'John does not understand.', 'John hears: '],
    objs=[('A pocket torch. (lit)', '_ 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ TORCH _')],
)
CMDS_EN['en_parser'] = ['get key', 'get the key', 'get it', 'getit', 'take golden key', 'get red key',
                        'open door with key', 'open the door with the golden key', 'get key and open door',
                        'get key then open door', 'get key. open door', 'get key, door',
                        'quick get key', 'get key quickly', 'n', 'north', 'go north', 'go to the north',
                        'key', 'golden', 'xyzzy', 'examine it', 'give the coin to john', 'give coin',
                        'tell john "open door"', 'tell john "xyzzy"', 'get key and coin',
                        'get all except the coin', 'i', 'get', 'GET KEY', 'Get Key golden', 'open',
                        'door', 'x them', 'examinelo', 'opendoor', 'getla', 'open it and x it',
                        'get key and and door', 'get key; x door: x coin! x key? x door',
                        'x key "hello. bye" door', 'x key "unterminated', 'get red golden key',
                        'get golden key red', 'golden key', 'get golden', 'get golden it', 'x golden key with red door',
                        'get red it', '', 'q', 'n', 'q', 'y']

# ---------------------------------------------------------------- WHATO sin objeto y pronombre (los dos idiomas)
def whato(lang):
    v = dict(es=('PRUEB', 'LIBRO', 'NADA', 'TODO', 'MENOS'), en=('TEST', 'BOOK', 'NOTHI', 'ALL', 'EXCEP'))[lang]
    return dict(
        lang=lang,
        init='                LET     42       2',
        vocab="""%s 50 verb
%s 101 noun
%s 102 noun
""" % v[:3],
        objs=[('A pocket torch.', '_ 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _'),
              ('A book.', '1 3 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ %s _' % v[1])],
        locs=[('Intro.', ''), ('Room.', '')],
        pro5="""> %s _     SETCO 0
                WHATO
                PRINT 51
                SPACE
                PRINT 54
                SPACE
                PRINT 55
                SPACE
                PRINT 46
                NEWLINE
                DONE""" % v[0],
        msgs=['-'],
    ), ['%s %s' % (v[0], v[1]), '%s %s' % (v[0], v[2]), v[0], '%s %s %s %s' % (v[0], v[3], v[4], v[1]),
        '%s %s %s %s' % (v[0], v[3], v[4], v[2]), '%s %s' % (v[2], v[1])]
CASES_EN['whato'], CMDS_EN['whato'] = whato('es')
CASES_EN['en_whato'], CMDS_EN['en_whato'] = whato('en')

# ---------------------------------------------------------------- contenedores (los dos idiomas)
def cont(lang):
    v = dict(es=('METER', 'SACAR', 'SACO', 'LIBRO', 'MONEDA'), en=('INSER', 'TAKEO', 'SACK', 'BOOK', 'COIN'))[lang]
    return dict(
        lang=lang,
        init='                LET     42       2',
        vocab="""%s 40 verb
%s 41 verb
%s 101 noun
%s 102 noun
%s 103 noun
""" % v,
        objs=[('A pocket torch.', '_ 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _'),
              ('A sack', 'CARRIED 1 Y _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ %s _' % v[2]),
              ('A book', 'CARRIED 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ %s _' % v[3]),
              ('A coin', '1 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ %s _' % v[4])],
        locs=[('Intro.', ''), ('Room.', ''), ('', '')],
        pro5="""> %s _     AUTOP 1
                DONE
> %s _     AUTOT 1
                DONE""" % v[:2],
        msgs=['-'],
        stx={44: 'IN44', 45: 'OUT45', 52: 'NO52', 51: 'END51'},
    ), ['%s %s' % (v[0], v[3]), '%s %s' % (v[0], v[3]), '%s %s' % (v[1], v[3]), '%s %s' % (v[1], v[3]),
        '%s %s' % (v[1], v[4]), '%s %s' % (v[0], v[4])]
CASES_EN['cont'], CMDS_EN['cont'] = cont('es')
CASES_EN['en_cont'], CMDS_EN['en_cont'] = cont('en')
