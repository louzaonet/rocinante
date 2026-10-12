# Montar el entorno de pruebas en Linux

[Read in English](README.md)

La batería completa de Rocinante (`tools/test-all.sh`) juega las exportaciones en los intérpretes DAAD originales de cada máquina, dentro de emuladores. Está hecha y comprobada en **Ubuntu 24.04 LTS en x86-64**; un Debian 12 debería servir igual. En macOS solo funcionan las partes de JavaScript, Spectrum y CPC (las demás necesitan X11), y en una Raspberry Pi depende de qué emuladores tenga empaquetados para ARM.

Con todo instalado, la batería completa tarda unos 35 minutos en un PC de sobremesa normal. Casi todo ese tiempo es el emulador de Spectrum, que está escrito en Python.

## Lo rápido

```
git clone <el repositorio> rocinante
cd rocinante
tools/setup-ubuntu.sh        # paquetes, .venv, npm install y ROM descargables
. .venv/bin/activate
tools/test-all.sh
```

`tools/setup-ubuntu.sh` hace todo lo que se puede automatizar y al final dice qué falta. Lo que no se puede automatizar está más abajo: el Kickstart del Amiga (hay que comprarlo) y los juegos clásicos (los pone cada uno).

Si falta algo de una máquina, su parte se salta y el resto sigue. Lo único que para la batería es que falte skoolkit, el emulador de Spectrum.

## Paso a paso

### 1. Paquetes del sistema

```
sudo apt install python3 python3-venv python3-pip \
     mame vice openmsx cbios dosbox hatari fs-uae xvfb xdotool pasmo unzip curl
```

| Paquete | Para qué | Versión con la que está comprobado |
|---|---|---|
| `mame` | Amstrad CPC | 0.264 |
| `vice` | Commodore 64 (`x64sc`) | 3.7.1 |
| `openmsx` y `cbios` | MSX; C-BIOS es una BIOS libre, no hace falta ninguna ROM más | 19.1 |
| `dosbox` | PC (DOS); trae su propio DOS, no hace falta ninguna ROM | 0.74-3 |
| `hatari` | Atari ST | 2.4.1 |
| `fs-uae` | Amiga | 3.1.66 |
| `xvfb` y `xdotool` | pantalla virtual y teclado para los emuladores que abren ventana (C64, MSX, PC, ST, Amiga) | |
| `pasmo` | solo si cambias algo de `z80/` (`node tools/genz80.mjs`) | 0.5.3 |

Todos están en los repositorios de Ubuntu 24.04. Las pruebas no muestran ninguna ventana: los emuladores corren en un servidor X virtual.

### 2. Node.js

Las pruebas están hechas con **Node 22**. El `nodejs` del repositorio de Ubuntu 24.04 es el 18 y no lo he probado; lo más seguro es instalar el 22 de NodeSource:

```
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install nodejs
```

(`tools/setup-ubuntu.sh` lo hace solo si no encuentra un Node 20 o posterior.) Luego, en la carpeta del proyecto:

```
npm install
```

### 3. Python: skoolkit y Pillow

Ubuntu 24.04 no deja instalar paquetes con `pip` fuera de un entorno virtual, así que se crea uno en la carpeta del proyecto (`.venv/` está en `.gitignore`):

```
python3 -m venv .venv
. .venv/bin/activate
pip install skoolkit pillow
```

skoolkit es el emulador de Spectrum con el que corren los intérpretes DAAD de `ref/` (comprobado con la 10.1); Pillow sirve para leer las capturas de pantalla de los demás emuladores. **Antes de lanzar las pruebas hay que activar el entorno** (`. .venv/bin/activate`) en cada terminal nueva.

### 4. ROM que se descargan solas

```
tools/setup-cpc.sh      # CPC 6128 y 464, de Caprice32 (Amstrad permite distribuirlas con emuladores)
tools/setup-c64.sh      # C64 y unidad 1541, de la réplica de VICE en GitHub
tools/setup-atari.sh    # EmuTOS 1.4, el TOS libre (GPL), de SourceForge
```

Quedan en `.roms/`, que está en `.gitignore`. Ninguna forma parte de Rocinante.

### 5. El Kickstart 1.3 del Amiga (hay que comprarlo)

La parte del Amiga arranca el disco en un A500 emulado con FS-UAE, y para eso hace falta el **Kickstart 1.3** de Commodore, que sigue teniendo dueño (Cloanto) y no se puede descargar libremente. Sin él, esa parte se salta y la batería acaba igual con "Todo bien", pero las exportaciones de Amiga no se habrán probado en el emulador.

La forma legal de tenerlo es comprar **Amiga Forever** de Cloanto, en [amigaforever.com](https://www.amigaforever.com/). La edición más barata, *Value Edition* (descarga para Windows), incluye los Kickstart 1.1, 1.2 y 1.3 y el Workbench 1.3; la *Plus Edition* añade los demás. Con cualquiera de las dos vale. Otra opción, si tienes un móvil Android, es la aplicación *Amiga Forever Essentials* de Google Play, que solo trae las ROM.

Una vez comprado:

1. Las ROM están en la carpeta `Amiga Files/Shared/rom` de la instalación (en Amiga Forever, menú File → Open Folder → Amiga Files). El Kickstart 1.3 es `amiga-os-130.rom`.
2. Cópialo a `.roms/amiga/kick13.rom` en la carpeta del proyecto:

   ```
   mkdir -p .roms/amiga
   cp "/ruta/a/Amiga Files/Shared/rom/amiga-os-130.rom" .roms/amiga/kick13.rom
   ```

3. Si el fichero empieza por el texto `AMIROMTYPE1` (`head -c 11 .roms/amiga/kick13.rom`), está cifrado, como en las versiones de Amiga Forever anteriores a la 8: copia también `rom.key` de la misma carpeta a `.roms/amiga/` y a `~/Documents/FS-UAE/Kickstarts/`, que es donde FS-UAE busca la clave. En Amiga Forever 8 y posteriores las ROM ya vienen descifradas.

Si tienes el Kickstart de otra fuente (por ejemplo, volcado de tu propio Amiga), cualquier Kickstart 1.3 de 256 KB sirve; el que hay que poner es la revisión 34.5 del A500 o la de Amiga Forever, que está parcheada para equivaler a ella.

### 6. Juegos clásicos (opcional)

`test/classic.py` importa los juegos que haya en `.clasicos/` (también en `.gitignore`), los exporta y los juega con las mismas órdenes en su intérprete original, en el DAAD 2 y en el motor de Rocinante, comparando texto y pantallas. Valen cintas `.tap` y `.tzx`, instantáneas `.z80` y `.sna` y discos de +3 `.dsk` de juegos de DAAD de Spectrum (de las dos versiones). Si junto a un juego hay un `.txt` con el mismo nombre, una orden por línea, se juegan esas órdenes; si no, 150 al azar sacadas de su vocabulario.

Los juegos no van con Rocinante. Si la carpeta no existe o está vacía, la prueba se salta. Para usar otra carpeta: `CLASICOS=/ruta tools/test-all.sh`.

## Pasar las pruebas

```
. .venv/bin/activate
npm test                     # solo JavaScript: unos segundos
tools/test-all.sh --solo-js  # lo mismo más las pruebas de JavaScript lentas
tools/test-all.sh            # todo, con los emuladores: unos 35 minutos
```

`tools/test-all.sh` va máquina por máquina y al final escribe `Todo bien.`; si algo falla, para ahí con el detalle. Cada parte se puede lanzar suelta: `python3 test/cpc.py`, `python3 test/c64.py`, `python3 test/msx.py`, `python3 test/dos.py`, `python3 test/st.py`, `python3 test/amiga.py`, `python3 test/classic.py`. Las del Spectrum son `test/roundtrip.py`, `run128.py`, `runsnap.py`, `template.py`, `pictures.py`, `tapes.py` y `vector.py`.

## Herramientas que no están en la batería

- **La interfaz en el navegador** (`tools/uitest.py es|en`, `tools/vecui.py`): necesitan Playwright con Chromium, dentro del mismo entorno virtual:

  ```
  pip install playwright
  playwright install --with-deps chromium
  ```

  Las capturas quedan en `/tmp/ui_es/` o `/tmp/ui_en/`.
- **Juegos de PAW** (`tools/pawcheck.py juego.z80` para los dibujos, `tools/pawplay.py juego.z80` para el texto): solo necesitan skoolkit y node, que ya están.
- **Regenerar las referencias de los casos de prueba** (`test/gen.py`, `test/gen_en.py`): hace falta DRC, el compilador de DAAD, que `tools/setup-drc.sh` descarga y compila en `.drc/` con `apt install git fpc php-cli`. Solo hace falta si cambias o añades casos; para pasar la batería, no.

## Si algo falla

- *`Falta skoolkit`*: no está activado el entorno virtual (`. .venv/bin/activate`).
- *Una parte dice que se salta*: le falta el emulador, el servidor X virtual o su ROM; `tools/setup-ubuntu.sh` sin argumentos (o con `--sin-apt` si ya están los paquetes) repasa qué hay y qué no.
- *`mame` no se encuentra pero está instalado*: en Debian está en `/usr/games`, que a veces no entra en el `PATH` de sudo o de cron. Las pruebas lo buscan también ahí.
- *Las pruebas del C64 fallan de forma intermitente*: VICE tarda en arrancar en máquinas lentas; vuelve a lanzar `python3 test/c64.py`.
- *El Amiga se salta aunque está el Kickstart*: comprueba el nombre exacto, `.roms/amiga/kick13.rom`, y si está cifrado, que `rom.key` esté al lado y en `~/Documents/FS-UAE/Kickstarts/`.
