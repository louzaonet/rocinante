<p align="center"><img src="docs/logo.svg" width="128" alt="Logo de Rocinante: cabeza de caballo con una pluma y la crin en los cuatro colores del Spectrum"></p>

# Rocinante

Editor de aventuras conversacionales para DAAD. Funciona en el navegador, en un solo fichero HTML. Los juegos usan el modelo de DAAD (el sucesor de PAW) y se pueden publicar como página web, para Spectrum 48K o 128K, Amstrad CPC, Commodore 64, MSX, PC (MS-DOS), Atari ST y Amiga, con el intérprete DAAD original de cada máquina dentro.

La interfaz del editor está en castellano y en inglés, y los juegos pueden escribirse en cualquiera de los dos idiomas. Cada idioma usa su intérprete: en Spectrum, DS48IS para castellano y DS48IE para inglés; en CPC, DCPCIS y DCPCIE; en C64, SDI64 y EDI64; en MSX, MSXSDI y MSXEDI; en PC, INTSM1 e INTEM1; en Atari ST y Amiga, SDI1 y EDI1.

[Read in English](README.md)

## Uso

Abre `dist/rocinante.html` en cualquier navegador moderno. No necesita servidor ni conexión. El proyecto se guarda solo en el navegador (IndexedDB); para tener una copia, Proyecto → Guardar proyecto (.json).

El idioma de la interfaz sigue al del navegador. El botón junto a Deshacer/Rehacer lo cambia.

Paneles:

- Juego: título, autoría, idioma del juego, banderas con nombre y una guía corta.
- Mapa: se dibuja solo a partir de las salidas.
- Localidades, Objetos, Vocabulario, Mensajes, Mensajes del sistema.
- Procesos: editor de código con resaltado, ayuda de cada condacto y errores con número de línea. Las entradas se escriben así:

  ```
  > ABRIR PUERTA
      AT pasillo
      ZERO puerta_abierta
      SET puerta_abierta
      MESSAGE "La puerta se abre con un chirrido."
      DONE
  ```

- Dibujos, de dos clases:
  - Mapas de bits: importa una imagen (se guarda el original para la web y se convierte a pantalla de Spectrum con atributos) o pinta encima con el editor.
  - Dibujos vectoriales, como los de PAW y DAAD: líneas, puntos, rellenos, tramas, letras, colores y otros dibujos dentro (GOSUB, con escala). Se dibuja pinchando en una pantalla de Spectrum y cada clic añade una orden a una lista que se puede reordenar o recortar. Ocupan unos cientos de bytes, así que caben de sobra en 48K. El editor avisa cuando una orden se sale de la pantalla, que en el Spectrum es el error B de la ROM y para la partida. Un dibujo vectorial se puede convertir en mapa de bits.
  - La herramienta Seleccionar trabaja con piezas enteras en vez de órdenes sueltas: un trazo con su relleno, un bloque de color, una letra o un subdibujo. Se eligen con un clic, Mayús+clic o arrastrando un rectángulo, y se arrastran o se mueven con las flechas (con Mayús, de 8 en 8). Se pueden copiar, cortar, pegar y duplicar (Ctrl+C, X, V, D, también de un dibujo a otro del mismo juego), borrar, voltear, girar 90°, poner delante o detrás, o pasar a un subdibujo que se llama con GOSUB. Rocinante reescribe las órdenes para que lo demás se quede exactamente donde estaba.
- Probar: el juego corriendo con el mismo motor que la página publicada, más el estado de banderas y objetos.

## Idioma del juego

Proyecto → Juego nuevo en castellano / en inglés parte de una plantilla con vocabulario, mensajes del sistema y bucle principal en ese idioma. El idioma decide también cómo se entienden las órdenes, igual que cada intérprete:

- Castellano: `_` cambia el artículo indeterminado por el determinado («Una linterna» pasa a «la linterna») y `@` hace lo mismo con mayúscula. El adjetivo va detrás del nombre y funcionan los pronombres pegados al verbo (COGERLO, EXAMINALA).
- Inglés: `_` escribe el texto del objeto hasta el primer punto y sin su primera palabra («A brass lamp. It is lit» pasa a «brass lamp»), por eso los mensajes dicen «the _». No hay `@`. El adjetivo va delante del nombre.

Cambiar el idioma de un juego ya empezado (panel Juego) cambia el intérprete y el analizador, pero no traduce el vocabulario ni los mensajes.

## Exportar

El menú Exportar va por plataformas; dentro de cada una se elige el formato.

- Página web (.html): un fichero que funciona solo. Los mapas de bits salen en alta resolución si hay imagen original; si no, en su versión Spectrum. Los vectoriales se pintan como los pinta el intérprete.
- ZX Spectrum:
  - 128K, como instantánea (.z80) para emuladores o como cinta (.tap), que también carga en una máquina real: los textos largos y los dibujos van a los bancos de memoria mediante una rutina EXTERN propia (`z80/xbank.asm`).
  - 48K (.z80 o .tap): todo en la memoria principal. Los dibujos vectoriales van en la base de datos gráfica, como los espera DAAD. Los mapas de bits van comprimidos, por orden, mientras quepan; el editor dice cuántos se quedan fuera.
  - Las cintas salen de tres formas con el mismo contenido: .tap, .tzx (con el título y el autor dentro) y .wav, el sonido de la cinta, para cargar el juego en un Spectrum de verdad desde el móvil o el ordenador por la entrada EAR. Llevan un programa BASIC corto y un cargador en código máquina propio (`z80/tapload.asm`) que carga el intérprete, la base de datos, los gráficos y, en 128K, los bancos de memoria.
  - Base de datos DAAD (.ddb): para usarla con otras herramientas DAAD.
- Amstrad CPC (464, 664 y 6128):
  - Disco (.dsk): se arranca con `RUN"DISC"`.
  - Cinta (.cdt) y su sonido (.wav), para el 464 o cualquier CPC sin disco: se carga con `RUN""`.
  - Base de datos DAAD (.ddb), colocada para el intérprete de CPC.

  El juego va en un solo fichero con el intérprete, la base de datos y los gráficos, como lo montaba el MCRF de DAAD. Caben unos 32 KB entre base de datos y dibujos; si no cabe, el editor dice cuánto falta.

  El CPC tiene su propio juego de órdenes de dibujo, así que los dibujos vectoriales se convierten al exportar. El dibujo queda centrado en la pantalla y con las mismas medidas que en el Spectrum. El color es lo que más cambia: el modo 1 del CPC tiene cuatro tintas para toda la pantalla, y las dos primeras son las del texto (negro y blanco). Las otras dos se eligen en cada dibujo entre los colores que más se ven, y cada línea, relleno o trama se pinta con la tinta más parecida al color que tiene en el Spectrum. Los fondos de color de los cuadros del Spectrum pasan a ser cajas de color al principio del dibujo. Un dibujo de muchos colores pierde los menos usados. Los mapas de bits no salen en el CPC, porque su intérprete solo pinta dibujos vectoriales.

  El juego de caracteres es el del proyecto si tiene uno propio; si no, el del intérprete de CPC.
- Commodore 64:
  - Disco (.d64), como los de DAAD: el cargador original, la base de gráficos, el intérprete y la base de datos. Se arranca con `LOAD"*",8` y `RUN`; los emuladores lo hacen solos.
  - Base de datos DAAD (.ddb), colocada para el intérprete de C64 (3880h).

  Caben unos 35 KB entre base de datos y dibujos. El C64 pinta en alta resolución con tinta y papel por cuadro de 8x8, como el Spectrum, así que los dibujos vectoriales pasan casi orden por orden, con los mismos choques de color. Quedan centrados en la pantalla, que es más ancha. BRIGHT da los colores claros del C64 (azul claro, rojo claro, verde claro); donde el Spectrum distingue un color normal y uno con BRIGHT que el C64 no tiene (amarillo, cian, magenta), salen iguales. Los mapas de bits no salen, porque el intérprete solo pinta dibujos vectoriales. El juego de caracteres es el del proyecto si tiene uno propio; si no, el del intérprete de C64.
- MSX:
  - Cartucho (.rom): el intérprete, la base de datos y los gráficos, con un arranque propio (`z80/msxcart.asm`) que hace lo que hacía el cargador de DAAD bajo MSX-DOS, sin MSX-DOS. Funciona en cualquier emulador de MSX, también con C-BIOS (la BIOS libre que traen muchos), y en un MSX de verdad con 64 KB de RAM y un cartucho flash. Es un cartucho de 128 KB con mapper ASCII16.
  - Base de datos DAAD (.ddb), colocada para el intérprete de MSX (0100h).

  Caben unos 42 KB entre base de datos y dibujos. El MSX de DAAD usa las mismas órdenes de dibujo que el Spectrum, así que los dibujos vectoriales pasan casi tal cual: INK y PAPER cambian a los colores del MSX (contando el brillo) y BRIGHT y FLASH desaparecen; un BRIGHT que en el Spectrum aviva un cuadro ya pintado no lo hace en el MSX. Los mapas de bits no salen, porque el intérprete solo pinta dibujos vectoriales. El juego de caracteres es el del proyecto (o el de DAAD), también para las tramas.
- PC (MS-DOS):
  - Carpeta para DOSBox (.zip): el intérprete, la base de datos, los dibujos, el juego de caracteres, `JUGAR.BAT` (`PLAY.BAT` en inglés) y unas instrucciones. Se descomprime y se arrastra `JUGAR.BAT` sobre DOSBox. En un PC con MS-DOS basta con escribir `JUGAR` en esa carpeta.
  - Disquete de 1,44 MB (.img) con los mismos ficheros, para emuladores de PC. No es de arranque: se arranca MS-DOS o FreeDOS desde otro disco y se escribe `JUGAR` en la unidad A:.
  - Base de datos DAAD (.ddb), en el formato de 16 bits del PC.

  Se juega en VGA, o en EGA o CGA si no hay VGA. Los dibujos son como en el ST y el Amiga (ver abajo).
- Atari ST:
  - Disco (.st) de 720K con el intérprete, la base de datos, los dibujos y el juego de caracteres. Arranca solo con EmuTOS (el TOS libre que traen muchos emuladores) y con el TOS 1.04 o posterior; con un TOS anterior hay que abrir `SDI1.PRG` (`EDI1.PRG` en inglés) desde el escritorio. Necesita un monitor en color, en baja resolución.
  - Base de datos DAAD (.ddb), en el formato de 16 bits del ST.
- Amiga:
  - Disco (.adf) de 880K con el intérprete, la base de datos, los dibujos y el juego de caracteres. Arranca solo al meterlo en la disquetera.
  - Base de datos DAAD (.ddb), en el formato de 16 bits del Amiga.

  En el PC, el ST y el Amiga los dibujos son imágenes de 16 colores, sin órdenes vectoriales, y la base de datos puede llegar a 64 KB. Los vectoriales se pintan como en el Spectrum y se guardan como imagen; los mapas de bits salen de la imagen original reducida a 16 colores (con tramado si hace falta) o, si no la hay, de su versión Spectrum. Cada dibujo ocupa el mismo sitio que en el Spectrum. El texto usa el juego de caracteres del proyecto, en columnas de 6 puntos como en el Spectrum, así que caben 53 por línea.

## Importar

- Juegos de DAAD de Spectrum (.tap, .tzx, .z80, .sna y discos de +3 .dsk), de las dos versiones de DAAD: vocabulario, textos, procesos, objetos, conexiones, dibujos y juego de caracteres. La tabla de colores de los gráficos se aplica a INK, PAPER y BORDER, porque el proyecto usa la normal.
  - La primera versión de DAAD (la de los juegos de 1989, como La Aventura Original) llevaba el bucle del juego dentro del intérprete, como PAW: describir la localidad, el proceso 1 después, el 2 antes de cada orden, el 0 con las respuestas y, si nada hizo algo, las conexiones. Al importar, ese bucle pasa a los procesos del proyecto, con las banderas que el intérprete bajaba solo y la 40, que decía si la localidad tenía dibujo. Los condactos que cambiaron en la versión 2 (INVEN, DESC, TURNS, SCORE, PICTURE, PROMPT, RESET, TIMEOUT, COPYOF y los demás COPY) se escriben con los de la 2. Lo que no queda igual: en las listas de objetos seguidas, DAAD 1 cambiaba «un» y «una» por «el» y «la»; INVEN lista los objetos con LISTAT, no uno por línea; GRAPHIC y EXTERN no tienen equivalente.
  - En un disco de +3 se cargan los ficheros de código en su dirección. Si el disco tiene un formato propio, se busca el juego en el contenido de las pistas. Si hay varias partes, se elige cuál importar.
  - Las cintas con cargador propio (turbo, protegidas, bloques sin cabecera) dan "formato de fichero no soportado".
- Juegos de DAAD de Atari ST (.st), Amiga (.adf, OFS o FFS), PC (disquete .img o la carpeta del juego en un .zip) y MSX (el cartucho .rom que hace Rocinante o un disco de MSX-DOS): cada fichero .DDB del disco es una parte, con sus gráficos en el .DAT (o el .MDG en el MSX) y el juego de caracteres en el .CHR del mismo nombre.
  - Las imágenes de 16 colores del ST, el Amiga y el PC pasan a mapas de bits del Spectrum en el mismo sitio (lo que no cabe en los 256x192 del Spectrum se encoge), y la imagen original se guarda como maestra: la usan la página web y las exportaciones de 16 bits, así que vuelven a salir con sus colores.
  - Los dibujos vectoriales del MSX vuelven a ser los del Spectrum: sus colores pasan por la tabla de colores del propio fichero.
  - Solo se ha comprobado con la versión 2 de DAAD y con lo que exporta Rocinante: los discos de MSX-DOS y los .adf con FFS se leen según su formato, sin un juego original con el que probarlos. Con un juego de la primera versión de DAAD en estas máquinas, el informe avisa de que su soporte es experimental.
- Juegos de DAAD de Amstrad CPC (disco .dsk o cinta .cdt) y de Commodore 64 (disco .d64 o un .prg): cada fichero de código va a su dirección de carga y de ahí sale la base de datos. De momento sin los dibujos. Las cintas del CPC con cargador propio dan "formato de fichero no soportado".
- Juegos de PAW de Spectrum (.z80, .sna, .tap o .tzx), de 48K y de 128K: vocabulario, textos, procesos, objetos, conexiones y dibujos. El idioma se detecta del propio juego. Se trae el juego de caracteres del juego, y sus caracteres gráficos (UDG, bloques, ©) van a los huecos de las letras del castellano que no use. Los condactos que no existen en DAAD se traducen o se quitan (MODE, LINE, CHARSET, GRAPHIC) y el informe dice qué ha cambiado.
- De una cinta, cada bloque de código va a la dirección de su cabecera y, en 128K, al banco que pagina el cargador BASIC antes de cada LOAD ""CODE (OUT 32765 o POKE 23388). Las cintas con cargador propio (turbo, protegidas, bloques sin cabecera) no se pueden colocar así: cárgalas en un emulador y guarda una instantánea .z80 cuando empiece la partida.
- Los dibujos de PAW siguen siendo vectoriales, así que un juego de 48K sigue cabiendo en 48K. El formato es casi el de DAAD; lo que cambia por el camino:
  - PAW sombrea con dos de sus 16 tramas y DAAD con un carácter, así que cada combinación que se usa pasa a ser un carácter (del 164 al 255).
  - TEXT en un dibujo de PAW puede usar cualquiera de las fuentes del juego (o la de la ROM); las letras que no son las del juego de caracteres del proyecto llevan su propio carácter en ese mismo hueco.
  - PICTURE en PAW pinta cualquier dibujo; DAAD solo enseña los de localidad, así que a los demás se llega con un dibujo más que los llama.
  - Si un dibujo de PAW se sale de la pantalla, PAW lo para con el error B de la ROM y sigue. DAAD pararía la partida, así que el dibujo se corta en el mismo sitio.
  - PRINTAT en PAW cuenta desde arriba de la pantalla, y se traduce para que quede igual.
  - QUIT en PAW, si no se contesta que sí, termina la entrada como DONE; en DAAD se pasa a la siguiente entrada. Se traduce con una bandera que el juego no use y una entrada más.
  - El bucle de PAW se reproduce en los procesos del proyecto: las banderas 2, 3 y 4 bajan al describir la localidad y las 5 a 10 después del proceso 2 de cada turno.

  `tools/pawcheck.py juego.z80` pinta cada dibujo de localidad con el propio código de PAW en el emulador y con el de Rocinante, y los compara. En los juegos de 48K con los que se ha probado coinciden todos punto a punto, salvo un punto en un dibujo que se sale de la pantalla. `tools/pawplay.py juego.z80` juega las mismas órdenes (unas dadas, o al azar del vocabulario) en el PAW original emulado y en el motor de Rocinante, y compara el texto palabra a palabra, azar incluido: PAW y DAAD usan el mismo generador. El texto del original se lee de la pantalla, así que lo que el juego borra con CLS antes de esperar al jugador no se ve y sale como diferencia.
- Bases de datos DAAD (.ddb), de las dos versiones y de cualquiera de las máquinas: la cabecera dice de cuál es.

## Compatibilidad

El motor en JavaScript (`src/daad/engine.js`) y la pantalla (`src/spectrum/daadscreen.js`) se han contrastado con los intérpretes reales DS48IS y DS48IE corriendo en un emulador: la salida de texto coincide carácter a carácter y las pantallas byte a byte en los casos de `test/cases`. Esto cubre el analizador (frases, conjunciones, pronombres, adjetivos, enclíticos del castellano), DOALL, listas de objetos, contenedores, ventanas, SAVE/LOAD y el "Más..." de la pantalla. Las plantillas de juego nuevo, la exportación a 128K con bancos, los dibujos en 48K y 128K (mapas de bits, y vectoriales, también los que escribe el editor) y las cintas en .tap y .tzx (cargadas a través de la ROM, como en un Spectrum real) también se ejecutan en los intérpretes reales en los dos idiomas. Los dibujos vectoriales usan una copia de la rutina de relleno del propio intérprete, porque las tramas y los rellenos que se escapan tienen que coincidir exactamente.

Las exportaciones para Amstrad CPC (disco, cinta y sonido de la cinta) se han jugado en un CPC emulado con los intérpretes originales DCPCIS y DCPCIE, en los dos idiomas, y sus dibujos se han comparado con los del Spectrum. Lo mismo con el Commodore 64: el disco se ha jugado en VICE con el cargador y los intérpretes originales SDI64 y EDI64. Y con el MSX: el cartucho se ha jugado en openMSX, con C-BIOS en un MSX1 y en un MSX2, con los intérpretes MSXSDI y MSXEDI. Y con el PC: la carpeta y el disquete se han jugado en DOSBox con los intérpretes INTSM1 e INTEM1. Y con el Atari ST: el disco se ha jugado en Hatari, con EmuTOS y los intérpretes SDI1 y EDI1. Y con el Amiga: el disco se ha jugado en FS-UAE, en un A500 con Kickstart 1.3 y los intérpretes sdi1 y edi1.

## Estructura

```
src/daad      formato DDB (leer y escribir), condactos, motor, exportación 128K
src/spectrum  bases de los intérpretes, .z80 (leer y escribir), pantalla exacta
src/cpc       Amstrad CPC: intérpretes, conversión de dibujos, discos .dsk y cintas .cdt
src/c64       Commodore 64: cargador e intérpretes, conversión de dibujos, discos .d64
src/m68k      Atari ST y Amiga: intérpretes, base de 16 bits, dibujos en imágenes (PART1.DAT, también el del PC)
src/msx       MSX: intérpretes, base de gráficos MDG, cartucho .rom
src/dos       PC (MS-DOS): intérpretes, carpeta .zip y disquete .img
src/disk      disquetes FAT12 (PC y ST) y ficheros .zip
src/atari     discos .st del Atari ST y arranque automático
src/amiga     discos .adf del Amiga
src/gfx       conversión de imágenes, compresión, dibujos vectoriales
src/import    importación de juegos clásicos (DAAD y PAW de Spectrum; DAAD de las demás máquinas)
src/paw       importador de PAW
src/project   proyecto editable <-> modelo DAAD (compilar y descompilar), plantillas
src/player    página web publicada
src/ui        editor (Preact)
src/web       pantalla y E/S para el navegador
src/i18n*.js  traducciones de la interfaz
z80           rutina EXTERN (bancos y dibujos), cargador de cinta y arranque del cartucho de MSX
tools         construcción, comprobación de traducciones y herramientas con emulador
test          casos y comparaciones con los intérpretes reales
docs          logo (SVG, y un PNG de 512 px para el avatar del repositorio) y cómo montar el entorno de pruebas
LICENSES      textos completos de las licencias (AGPL-3.0-or-later, MIT-0 y la de Preact)
```

## Construir

```
npm install
node tools/build.mjs
```

Genera `dist/rocinante.html`. La versión es la de `package.json` y sale al pie del panel lateral.

Si cambias algo en `z80/`, regenera `src/daad/xbank-bin.js`, `src/spectrum/tapload-bin.js` y `src/msx/msxload-bin.js` con `node tools/genz80.mjs` (necesita pasmo).

Los textos de la interfaz se escriben en castellano en el código y se traducen en `src/i18n-en.js`. `node tools/i18n-check.mjs` lista los que falten.

## Pruebas

```
npm test                  # solo JavaScript: motor, pantallas, DDB, proyectos, órdenes y piezas de dibujo, traducciones
tools/test-all.sh         # además, todas las exportaciones en los intérpretes reales
```

`tools/test-all.sh` necesita Python 3 con skoolkit (`pip install skoolkit`), que pone el emulador y `tap2sna.py`. Los intérpretes ya están en `ref/`. Para montar el entorno entero en Ubuntu 24.04, `tools/setup-ubuntu.sh`; el paso a paso, con lo del Kickstart del Amiga, está en [docs/pruebas/LEEME.md](docs/pruebas/LEEME.md).

Para el Amstrad CPC, además, MAME y Pillow (`apt install mame`, `pip install pillow`) y las ROM del CPC 6128 y 464, que `tools/setup-cpc.sh` deja en `.roms/` (son de Amstrad, que permite distribuirlas con emuladores; no forman parte de Rocinante). Sin ellas, esa parte se salta. Si cambian los intérpretes de `ref/cpc/`, `node tools/mkcpcbase.mjs` regenera `src/cpc/cpcbase.js`.

Para el Commodore 64, VICE y Xvfb (`apt install vice xvfb`; el VICE de Debian necesita una pantalla) y las ROM del C64 y de la 1541, que `tools/setup-c64.sh` deja en `.roms/vice/` (tampoco forman parte de Rocinante). `node tools/mkc64base.mjs` regenera `src/c64/c64base.js` a partir de `ref/c64/`.

Para el MSX, openMSX y C-BIOS (`apt install openmsx cbios`); C-BIOS es libre, así que no hace falta ninguna ROM más. `node tools/mkmsxbase.mjs` regenera `src/msx/msxbase.js` a partir de `ref/msx/`.

Para el PC, DOSBox, Xvfb y xdotool (`apt install dosbox xvfb xdotool`); no hace falta ninguna ROM, porque DOSBox trae su propio DOS. `node tools/mkdosbase.mjs` regenera `src/dos/dosbase.js` a partir de `ref/dos/`.

Para el Atari ST, Hatari y Xvfb (`apt install hatari xvfb`) y EmuTOS, que `tools/setup-atari.sh` deja en `.roms/atari/` (EmuTOS es libre, GPL, pero no forma parte de Rocinante). `node tools/mkm68kbase.mjs` regenera `src/m68k/m68kbase.js` a partir de `ref/atari/` y `ref/amiga/`.

Para el Amiga, FS-UAE, Xvfb y xdotool (`apt install fs-uae xvfb xdotool`) y el Kickstart 1.3 del A500 en `.roms/amiga/kick13.rom`. El Kickstart es de Cloanto y no se puede descargar libremente: viene, por ejemplo, con Amiga Forever. Sin él, esa parte se salta.

Para añadir o cambiar casos de prueba (`test/gen.py`, `test/gen_en.py`) hay que volver a generar las transcripciones de referencia, y para eso hace falta DRC, que compila las bases de datos de prueba. `tools/setup-drc.sh` lo descarga y lo compila en `.drc/` (necesita git, Free Pascal y PHP; DRC es GPL y no forma parte de Rocinante). Después:

```
python3 test/gen.py             # bases de datos y transcripciones de referencia (todos los casos o los que se nombren)
node test/mksnap.mjs
python3 test/screens.py         # pantallas de referencia
```

Los casos `ramload` y `whato2` no salen de DRC: los escribe Rocinante con `node test/mkextra.mjs` (el fichero dice cómo sacar sus referencias).

Los .wav se comprueban dos veces: `tools/wavread.py` vuelve a sacar los bloques del sonido, y el emulador carga el sonido flanco a flanco con la rutina de la ROM, sin atajos.

`tools/uitest.py es|en` recorre la interfaz con Playwright. `tools/vecui.py proyecto.json dibujo es|en` prueba la herramienta Seleccionar del editor de dibujos vectoriales con un dibujo de un proyecto guardado. `tools/pawcheck.py` compara los dibujos de PAW importados con los originales (ver Importar). `test/classic.py` juega los juegos de DAAD de la carpeta `.clasicos/` (no van con Rocinante; los pone cada uno) con las mismas órdenes en su intérprete original, en el DAAD 2 después de importarlos y exportarlos, y en el motor JS, y compara el texto y los dibujos; las órdenes salen de `juego.txt`, junto al juego, o al azar de su vocabulario.

## Licencia

El editor es software libre con la licencia **GNU AGPL, versión 3 o posterior**: se puede usar, estudiar, cambiar y redistribuir, también cobrando, pero quien distribuya una versión modificada (o la ofrezca a otros a través de la red) tiene que dar su código fuente con la misma licencia.

Lo que Rocinante mete dentro de los juegos que exporta (el reproductor de la página web, el motor DAAD en JavaScript, las rutinas en Z80, los cargadores y ficheros de arranque, y el contenido de las plantillas de juego nuevo) tiene la licencia **MIT-0**, que no pide nada: **cada autor distribuye su juego como quiera**, gratis o a la venta, con el código abierto o cerrado, y sin tener que mencionar a Rocinante. Los juegos son de quien los escribe.

`LICENSE` dice exactamente qué ficheros van con cada licencia, y los textos completos están en `LICENSES/`. Los intérpretes DAAD que van dentro de los juegos exportados (Spectrum, Amstrad CPC, Commodore 64 con su cargador, MSX, PC, Atari ST y Amiga) son de dominio público: Andrés Samudio, fundador de Aventuras AD, cedió DAAD al dominio público, y los intérpretes vienen del repositorio [daad-adventure-writer/DAAD](https://github.com/daad-adventure-writer/DAAD). Ver `LICENSE`.
