"""Genera juegos de prueba .DSF a partir de la plantilla en blanco de DAAD en
castellano, los compila con DRC y obtiene la transcripción de referencia
ejecutándolos en el intérprete original de Spectrum.

Uso: python3 gen.py [caso ...]      (sin argumentos, todos)
Salida: cases/<caso>.dsf, cases/<caso>.ddb, cases/<caso>.cmd, ref/<caso>.txt
"""
import os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
import zxdaad

class Blank:
    """Plantilla en blanco de DAAD (castellano o inglés) partida en secciones."""
    def __init__(self, lang):
        b = open(os.path.join(HERE, 'blank_%s.dsf' % lang), encoding='utf8').read()
        if '/END' not in b: b += '\n/END\n'
        sec = lambda name: re.search(r'^/%s\b.*?$(.*?)(?=^/[A-Z]{3})' % name, b, re.S | re.M).group(1)
        self.CTL = b[:b.index('/VOC')]
        self.VOC, self.STX = sec('VOC'), sec('STX')
        self.PRO = b[b.index('/PRO 0'):b.index('/END')]
BLANKS = {'es': Blank('es'), 'en': Blank('en')}

def build(case):
    """case: dict con vocab, stx (sustituciones), msgs, locs, objs, pro5, init, procs."""
    B = BLANKS[case.get('lang', 'es')]
    CTL, VOC, STX, PRO = B.CTL, B.VOC, B.STX, B.PRO
    out = [CTL, '/VOC\n', VOC, case.get('vocab', ''), '\n/STX\n']
    stx = STX
    for n, t in case.get('stx', {}).items():
        stx = re.sub(r'^/%d .*$' % n, '/%d "%s"' % (n, t), stx, flags=re.M)
    out.append(stx)
    out.append('/MTX\n')
    msgs = case.get('msgs', ['-'])
    for i, t in enumerate(msgs): out.append('/%d "%s"\n' % (i, t))
    objs = case.get('objs', [('Una linterna.(encendida)', '_ 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ LINTER _')])
    out.append('/OTX\n')
    for i, (t, _) in enumerate(objs): out.append('/%d "%s"\n' % (i, t))
    locs = case.get('locs', [('Introducción.', ''), ('Una habitación vacía.', '')])
    out.append('/LTX\n')
    for i, (t, _) in enumerate(locs): out.append('/%d "%s"\n' % (i, t))
    out.append('/CON\n')
    for i, (_, c) in enumerate(locs): out.append('/%d\n%s\n' % (i, c))
    out.append('/OBJ\n')
    for i, (_, d) in enumerate(objs): out.append('/%d %s\n' % (i, d))
    pro = PRO
    if 'pro5' in case:
        pro = pro.replace('/PRO 5 ;', '/PRO 5\n' + case['pro5'] + '\n;', 1)
    if 'pro0' in case:
        pro = re.sub(r'/PRO 0.*?(?=/PRO 1)', '/PRO 0\n' + case['pro0'] + '\n', pro, flags=re.S)
    if 'init' in case:
        pro = re.sub(r'^                GOTO    1 .*$', lambda m: case['init'] + '\n                GOTO    1', pro, count=1, flags=re.M)
    if 'intro' in case:
        pro = re.sub(r'^                DESC    0 .*\n                ANYKEY\n', lambda m: case['intro'], pro, count=1, flags=re.M)
    out.append(pro)
    out.append(case.get('procs', ''))
    out.append('/END\n')
    return ''.join(out)

CASES = {}

# ---------------------------------------------------------------- objetos
CASES['objetos'] = dict(
    vocab="""LIBRO   101 noun
BOTAS   102 noun
SACO    103 noun
MONEDA  104 noun
MAPA    105 noun
GUANTE  106 noun
METER   40 verb
SACAR   41 verb
""",
    msgs=['Ves _ y @ te mira.', 'Ref: _.', 'Ref: @.'],
    objs=[
        ('Una linterna.(encendida)', '_ 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ LINTER _'),
        ('Un libro viejo', '1 2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ LIBRO VIEJO'),
        ('Unas botas', '1 2 _ Y _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ BOTAS _'),
        ('Un saco', '1 1 Y _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ SACO _'),
        ('Una moneda de oro', '3 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ MONEDA _'),
        ('El mapa', 'CARRIED 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ MAPA _'),
        ('Unos guantes. Están rotos', 'WORN 1 _ Y _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ GUANTE _'),
        ('Un libro nuevo', '1 2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ LIBRO NUEVO'),
    ],
    locs=[('Intro.', ''), ('Una biblioteca polvorienta.', ''), ('Plaza.', ''), ('', '')],
    pro5="""> METER   _     AUTOP 3
                DONE
> SACAR   _     AUTOT 3
                DONE
> EXAMI   _     WHATO
                MESSAGE 0
                MESSAGE 1
                MESSAGE 2
                DONE""",
)
CMDS = {}
CMDS['objetos'] = ['mirar', 'i', 'coger libro', 'coger libro nuevo', 'i', 'coger todo',
                   'i', 'dejar todo', 'mirar', 'coger botas', 'poner botas', 'i', 'quitar botas',
                   'quitar guantes', 'coger saco', 'meter mapa', 'sacar moneda', 'sacar moneda',
                   'ex mapa', 'ex guantes', 'ex libro viejo', 'coger linterna', 'dejar saco',
                   'coger todo', 'coger todo', 'i']

# ---------------------------------------------------------------- analizador
CASES['parser'] = dict(
    vocab="""LLAVE   101 noun
PUERTA  102 noun
JUAN    40  noun
MONEDA  104 noun
DORADA  10  adjective
ROJA    11  adjective
ABRIR   40  verb
DAR     41  verb
DALE    41  verb
DILE    42  verb
COGE    20  verb
IR      43  verb
AL      6   preposition
CON     9   preposition
LO      2   pronoun
LA      2   pronoun
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
> DILE    JUAN  PARSE 1
                MESSAGE 1
                DONE
> DILE    JUAN  MES 2
                PRINT 33
                SPACE
                PRINT 34
                NEWLINE
                DONE""",
    msgs=['LS=', 'Juan no entiende.', 'Juan oye: '],
)
CMDS['parser'] = ['coger llave', 'coge la llave', 'cogela', 'cogelo', 'coger la llave dorada',
                  'coger llave roja', 'abrir puerta con llave', 'abrir la puerta con la llave dorada',
                  'coger llave y abrir puerta', 'coger llave. abrir puerta', 'coger llave, puerta',
                  'rapid coger llave', 'coger llave rapid', 'n', 'norte', 'ir al norte', 'al norte',
                  'llave', 'dorada', 'xyzzy', 'examinala', 'dale la moneda a juan', 'dale la moneda',
                  'dile a juan "abrir puerta"', 'dile a juan "xyzzy"', 'coger llave y moneda',
                  'coger todo menos la moneda', 'i', 'coger', 'COGER LLAVE', 'Coger Llave dorada',
                  'abrir', 'puerta']

# ---------------------------------------------------------------- control
CASES['control'] = dict(
    vocab="""UNO     50  verb
DOS     51  verb
TRES    52  verb
CUATRO  53  verb
CINCO   54  verb
SEIS    55  verb
SIETE   56  verb
OCHO    57  verb
NUEVE   58  verb
DIEZ    59  verb
ONCE    60  verb
DOCE    61  verb
LIBRO   101 noun
MAPA    105 noun
VELA    106 noun
CAJA    107 noun
NIEVE   30  noun
""",
    msgs=['sí', 'no', 'después del doall', 'siguiente entrada', '[', ']', 'fin', '-'],
    objs=[
        ('Una linterna.(encendida)', '_ 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ LINTER _'),
        ('Un libro viejo', '1 2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ LIBRO _'),
        ('El mapa', '1 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ MAPA _'),
        ('Una vela', '1 1 _ _ _ _ _ _ _ _ _ _ _ _ _ Y _ Y _ Y VELA _'),
        ('Una caja', '1 30 Y _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ CAJA _'),
        ('Una piedra', '4 5 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _'),
    ],
    locs=[('Intro.', ''), ('Una sala.', 'N 2\nS 3'), ('Norte.', 'S 1'), ('Sur.', 'N 1'), ('', '')],
    pro5="""> UNO     _     PROCESS 7
                ISDONE
                MESSAGE 0
                DONE
> UNO     _     MESSAGE 1
                DONE
> DOS     _     PROCESS 8
                ISDONE
                MESSAGE 0
                DONE
> DOS     _     MESSAGE 1
                DONE
> TRES    _     PROCESS 9
                ISDONE
                MESSAGE 0
                DONE
> TRES    _     MESSAGE 1
                DONE
> CUATRO  _     PROCESS 10
                ISNDONE
                MESSAGE 1
                DONE
> CUATRO  _     MESSAGE 0
                DONE
> CINCO   _     PROCESS 11
                ISDONE
                MESSAGE 0
                DONE
> CINCO   _     MESSAGE 1
                DONE
> SEIS    _     LET 100 0
                PROCESS 12
                DONE
> SIETE   _     LET 100 250
                PLUS 100 10
                PRINT 100
                SPACE
                MINUS 100 255
                PRINT 100
                SPACE
                LET 100 1
                LET 101 2
                DPRINT 100
                SPACE
                LET 102 200
                ADD 102 101
                PRINT 101
                SPACE
                SUB 100 101
                PRINT 101
                SPACE
                COPYFF 101 103
                PRINT 103
                SPACE
                LET 104 7
                COPYBF 105 104
                PRINT 105
                SPACE
                PRINT 1
                NEWLINE
                DONE
> OCHO    _     PRINT 29
                SPACE
                PRINT 37
                SPACE
                PRINT 52
                SPACE
                PRINT 38
                SPACE
                PRINT 46
                SPACE
                PRINT 47
                NEWLINE
                DONE
> NUEVE   _     LET 53 64
                LISTOBJ
                NEWLINE
                MES 4
                LISTAT CARRIED
                MES 5
                PRINT 53
                LET 53 0
                NEWLINE
                DONE
> DIEZ    _     SETCO 3
                PRINT 51
                SPACE
                PRINT 54
                SPACE
                PRINT 55
                SPACE
                PRINT 56
                SPACE
                PRINT 57
                SPACE
                PRINT 58
                SPACE
                PRINT 59
                SPACE
                HASAT 0
                MES 0
> DIEZ    _     HASAT 2
                MES 0
> DIEZ    _     HASNAT 1
                MES 1
> DIEZ    _     HASAT 31
                MES 7
> DIEZ    _     WEIGH 4 100
                PRINT 100
                SPACE
                WEIGHT 100
                PRINT 100
                NEWLINE
                DONE
> ONCE    _     SWAP 1 5
                PRINT 51
                SPACE
                COPYOF 1 100
                PRINT 100
                SPACE
                COPYOO 2 5
                COPYOF 5 100
                PRINT 100
                SPACE
                LET 100 4
                COPYFO 100 2
                COPYOF 2 101
                PRINT 101
                SPACE
                PLACE 3 CARRIED
                PRINT 1
                SPACE
                PUTO 1
                PRINT 1
                SPACE
                CREATE 3
                PRINT 1
                NEWLINE
                DONE
> DOCE    _     MOVE 38
                PRINT 38
                NEWLINE
                DONE
> DOCE    _     MESSAGE 1
                DONE
> EXAMI   _     MES 0
                PRINT 33
                SPACE
                PRINT 34
                SPACE
                PRINT 35
                NEWLINE
                DONE""",
    procs="""/PRO 7
> _       _     DOALL 3
                MESSAGE 2
> _       _     MESSAGE 3
/PRO 8
> _       _     DOALL CARRIED
                MES 4
                PRINT 34
                MES 5
> _       _     PRINT 50
                NEWLINE
/PRO 9
/PRO 10
> _       _     AT 3
                MESSAGE 0
/PRO 11
> _       _     MESSAGE 7
                NOTDONE
/PRO 12
> _       _     PLUS 100 1
                PRINT 100
> _       _     LT 100 5
                REDO
> _       _     SKIP 1
> _       _     MESSAGE 1
> _       _     MESSAGE 6
""",
)
CMDS['control'] = ['uno', 'dos', 'coger libro', 'coger mapa', 'dos', 'tres', 'cuatro', 'cinco',
                   'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'i', 'dejar todo',
                   'coger libro y mapa', 'dejar libro, mapa', 'coger libro. mapa', 'i', 'dejar todo',
                   'coger libro y n', 'doce', 'dejar libro', 'n', 'doce', 'doce', 's', 'cogerlo',
                   'examinalo', 'examinalos', 'examinale', 'examinarlo', 'nieve', 'ex nieve',
                   'coger todo', 'coger todo menos el mapa', 'i']

# ---------------------------------------------------------------- posiciones y bandera 1
STEP = """                PRINT 1
                SPACE
                PRINT 51
                SPACE
                COPYOF 1 100
                PRINT 100
                SPACE
                COPYOF 2 100
                PRINT 100
                SPACE
                COPYOF 3 100
                PRINT 100
                NEWLINE"""
CASES['posiciones'] = dict(
    vocab="""UNO     50  verb
DOS     51  verb
TRES    52  verb
LIBRO   101 noun
MAPA    105 noun
VELA    106 noun
""",
    msgs=['-'],
    objs=[
        ('Una linterna.(encendida)', '_ 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ LINTER _'),
        ('Un libro viejo. Muy gordo', 'CARRIED 2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ LIBRO _'),
        ('El mapa', 'CARRIED 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ MAPA _'),
        ('Una vela', '1 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ VELA _'),
    ],
    locs=[('Intro.', ''), ('Una sala.', ''), ('Otra.', '')],
    pro5="""> UNO     _     SETCO 3
""" + STEP + """
                SWAP 1 3
""" + STEP + """
                SWAP 1 3
                COPYOO 2 3
""" + STEP + """
                LET 100 1
                COPYFO 100 3
""" + STEP + """
                LET 100 254
                COPYFO 100 3
""" + STEP + """
                SETCO 1
                PUTO 2
""" + STEP + """
                PLACE 1 CARRIED
""" + STEP + """
                CREATE 1
""" + STEP + """
                DESTROY 2
""" + STEP + """
                CREATE 2
""" + STEP + """
                PLACE 2 254
""" + STEP + """
                DESTROY 2
""" + STEP + """
                PLACE 3 WORN
""" + STEP + """
                DONE
> DOS     _     LET 53 64
                LISTAT CARRIED
                LISTAT 1
                LISTAT 2
                NEWLINE
                LET 53 0
                LISTAT CARRIED
                DONE
> TRES    _     PLACE 1 1
                PLACE 2 1
                PLACE 3 1
                LET 53 64
                LISTOBJ
                LET 53 0
                LISTOBJ
                DONE""",
)
CMDS['posiciones'] = ['uno', 'dos', 'tres', 'mirar']

# ---------------------------------------------------------------- analizador 2
CASES['parser2'] = dict(
    vocab="""LLAVE   101 noun
PUERTA  102 noun
MONEDA  104 noun
CIELO   39  noun
MAR     40  noun
RIO     45  noun
BOSQUE  49  noun
LAGO    50  noun
DORADA  10  adjective
ABRIR   40  verb
MIRA    24  verb
CON     9   preposition
LO      2   pronoun
""",
    pro5="""> _       _     MES 0
                PRINT 33
                SPACE
                PRINT 34
                SPACE
                PRINT 35
                SPACE
                PRINT 44
                SPACE
                PRINT 46
                SPACE
                PRINT 47
                NEWLINE
> _       _     NOTEQ 34 104
                DONE
> COGER   MONEDA DONE""",
    msgs=['LS='],
)
CMDS['parser2'] = ['cielo', 'mar', 'rio', 'bosque', 'lago', 'ex lago', 'puerta', 'ex cielo',
                   'abrir puerta', 'llave dorada', 'abrir', 'coger moneda y llave', 'coger moneda, puerta',
                   'coger moneda. llave', 'coger moneda y n', 'coger moneda y abrir puerta',
                   'coger moneda y lo', 'coger moneda y examinalo', 'ex moneda con llave dorada',
                   'ex dorada llave', 'ex llave llave', 'ex con llave', 'mira', 'miralo', 'miralos',
                   'abrirlo', 'abrirla', 'abrirle', 'abrirlas', 'examinadlo', 'ex. llave', 'ex,llave',
                   'coger moneda y y llave', 'coger moneda and llave', '', '   ', 'moneda',
                   'ex llave.', 'ex llave y', 'ex llave, ', '. ex llave', 'ex llave..', 'ex llave .. ex puerta',
                   'ex llave y . ex puerta', 'xyzzy y ex llave', 'ex llave y xyzzy y ex puerta',
                   'ex llave "hola" y ex puerta', 'ex "hola. adios" puerta', 'ex llave "sin cerrar',
                   'ex llave; ex puerta: ex moneda! ex llave? ex puerta', 'EX LLAVE', 'Ex LlAvE']

# ---------------------------------------------------------------- pantalla
CASES['pantalla'] = dict(
    vocab="""UNO     50  verb
DOS     51  verb
TRES    52  verb
CUATRO  53  verb
CINCO   54  verb
SEIS    55  verb
SIETE   56  verb
""",
    msgs=['Texto de prueba en una ventana pequeña que obliga a partir muchas palabras.',
          'Una palabraextremadamentelargaquenocabeenningunalineadelaventana y más.',
          'Linea uno#nLinea dos#n#nLinea cuatro',
          'Antes de esperar#kdespués de esperar',
          'Borrar ahora:#bya borrado.',
          '#gABC#t abc',
          'x',
          'Este mensaje es bastante largo y sirve para llenar la ventana de texto varias veces seguidas hasta que aparezca el aviso de que hay más texto por leer, una y otra vez, sin parar, con muchas palabras de relleno que no dicen nada importante pero ocupan sitio en la pantalla del Spectrum.',
          ],
    pro5="""> UNO     _     WINDOW 2
                WINAT 2 5
                WINSIZE 5 20
                PAPER 1
                INK 6
                CLS
                MESSAGE 0
                MESSAGE 1
                WINDOW 1
                DONE
> DOS     _     WINDOW 3
                WINAT 0 30
                WINSIZE 4 12
                PAPER 2
                INK 7
                CLS
                PRINTAT 1 2
                MES 6
                TAB 5
                MES 6
                SAVEAT
                PRINTAT 3 0
                MES 6
                BACKAT
                MES 6
                PRINTAT 9 9
                MES 6
                WINDOW 1
                DONE
> TRES    _     MESSAGE 2
                MESSAGE 3
                MESSAGE 5
                DONE
> CUATRO  _     MESSAGE 4
                DONE
> CINCO   _     WINDOW 4
                WINSIZE 3 20
                CENTRE
                PAPER 4
                INK 0
                CLS
                MES 7
                WINDOW 1
                DONE
> SEIS    _     MODE 2
                MESSAGE 7
                MODE 0
                DONE
> SIETE   _     PAPER 9
                INK 10
                MESSAGE 6
                PAPER 0
                INK 7
                DONE""",
)
CMDS['pantalla'] = ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'mirar', 'esto no se entiende de ninguna manera posible', 'uno']

from gen_en import CASES_EN, CMDS_EN
CASES.update(CASES_EN); CMDS.update(CMDS_EN)

def make(name):
    os.makedirs(os.path.join(HERE, 'cases'), exist_ok=True)
    os.makedirs(os.path.join(HERE, 'ref'), exist_ok=True)
    dsf = os.path.join(HERE, 'cases', name + '.dsf')
    open(dsf, 'w', encoding='utf8').write(build(CASES[name]))
    subprocess.run([os.path.join(HERE, '..', 'tools', 'dsfc.sh'), dsf, CASES[name].get('lang', 'es')], check=True)
    cmds = CMDS.get(name, [])
    open(os.path.join(HERE, 'cases', name + '.cmd'), 'w', encoding='utf8').write('\n'.join(cmds) + '\n')
    ddb = open(dsf[:-4] + '.ddb', 'rb').read()
    txt = zxdaad.run(ddb, cmds)
    open(os.path.join(HERE, 'ref', name + '.txt'), 'w', encoding='utf8').write(txt)
    print('==', name, len(ddb), 'bytes'); print(txt)

if __name__ == '__main__':
    for n in sys.argv[1:] or CASES: make(n)
