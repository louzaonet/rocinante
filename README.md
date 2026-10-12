<p align="center"><img src="docs/logo.svg" width="128" alt="Rocinante logo: a horse head with a quill and a mane in the four Spectrum colours"></p>

# Rocinante

A text adventure editor for DAAD. It runs in the browser from a single HTML file. Games follow the DAAD model (the successor to PAW) and can be published as a web page, for the 48K or 128K ZX Spectrum, the Amstrad CPC, the Commodore 64, the MSX, the PC (MS-DOS), the Atari ST and the Amiga, with each machine's original DAAD interpreter inside.

The editor interface is available in English and Spanish, and games can be written in either language. Each language uses its own interpreter: on the Spectrum, DS48IE for English and DS48IS for Spanish; on the CPC, DCPCIE and DCPCIS; on the C64, EDI64 and SDI64; on the MSX, MSXEDI and MSXSDI; on the PC, INTEM1 and INTSM1; on the Atari ST and the Amiga, EDI1 and SDI1.

[Leer en castellano](README.es.md)

## Getting started

Open `dist/rocinante.html` in any modern browser. It needs no server and no network connection. Your project is saved automatically in the browser (IndexedDB); to keep a copy, use Project → Save project (.json).

The interface language follows the browser. The button next to Undo/Redo switches it.

Panels:

- Game: title, author, game language, named flags and a short guide.
- Map: drawn from the exits.
- Locations, Objects, Vocabulary, Messages, System messages.
- Processes: code editor with syntax colouring, help for every condact and errors with line numbers. Entries look like this:

  ```
  > OPEN DOOR
      AT corridor
      ZERO door_open
      SET door_open
      MESSAGE "The door creaks open."
      DONE
  ```

- Pictures, of two kinds:
  - Bitmaps: import an image (the original is kept for the web version and converted to a Spectrum screen with attributes) or paint over it in the built-in editor.
  - Vector pictures, like PAW and DAAD ones: lines, points, fills, shading patterns, characters, colours and other pictures drawn inside (GOSUB, with scale). You draw by clicking on a Spectrum screen and each click adds a command to a list that can be reordered or trimmed. They take a few hundred bytes, so they fit easily in 48K. The editor warns when a command goes off the screen, which on the Spectrum is ROM error B and stops the game. A vector picture can be turned into a bitmap.
  - The Select tool works on whole pieces instead of single commands: a stroke with its fill, a colour block, a character or a sub-picture. Click, Shift+click or drag a rectangle to pick them, then drag them or nudge them with the arrow keys (Shift for 8 pixels). Copy, cut, paste and duplicate (Ctrl+C, X, V, D, also between pictures of the same game), delete, flip, rotate 90°, bring to front or send to back, or turn the selection into a sub-picture called with GOSUB. Rocinante rewrites the commands so that everything else stays exactly where it was.
- Play: the game running on the same engine as the published page, with the current flags and objects alongside.

## Game language

Project → New game in English / New game in Spanish starts from a template with vocabulary, system messages and the main loop in that language. The language also decides how the parser behaves, matching each interpreter:

- English: `_` prints the object text up to the first full stop without its first word ("A brass lamp. It is lit" becomes "brass lamp"), so messages say "the _". There is no `@`. Adjectives go before the noun.
- Spanish: `_` swaps the indefinite article for the definite one ("Una linterna" becomes "la linterna") and `@` does the same with a capital letter. Adjectives go after the noun, and pronoun suffixes work (COGERLO, EXAMINALA).

Changing the language of an existing game (Game panel) switches the interpreter and the parser, but doesn't translate the vocabulary or the messages.

## Export

The Export menu is grouped by platform; pick the format inside each one.

- Web page (.html): one self-contained file. Bitmaps are shown in high resolution when there is an original image, otherwise in their Spectrum version. Vector pictures are drawn as the interpreter draws them.
- ZX Spectrum:
  - 128K, as a snapshot (.z80) for emulators or as a tape (.tap) that also loads on a real machine: long texts and pictures go into the memory banks through a small EXTERN routine of our own (`z80/xbank.asm`).
  - 48K (.z80 or .tap): everything in main memory. Vector pictures go in the graphics database as DAAD expects. Bitmaps go in, compressed, in order until memory runs out; the editor says how many were left out.
  - Tapes come in three forms with the same content: .tap, .tzx (with the title and author inside) and .wav, the tape's sound, to load the game on a real Spectrum from a phone or computer through the EAR socket. They carry a short BASIC program and a machine code loader of our own (`z80/tapload.asm`) that loads the interpreter, the database, the graphics and, on 128K, the memory banks.
  - DAAD database (.ddb): for use with other DAAD tools.
- Amstrad CPC (464, 664 and 6128):
  - Disk (.dsk): start it with `RUN"DISC"`.
  - Tape (.cdt) and its sound (.wav), for the 464 or any CPC without a disk drive: load it with `RUN""`.
  - DAAD database (.ddb), placed for the CPC interpreter.

  The game is a single file holding the interpreter, the database and the graphics, the way DAAD's MCRF put it together. There is room for about 32 KB of database and pictures; if the game does not fit, the editor says how much is missing.

  The CPC has its own set of drawing commands, so vector pictures are converted on export. The picture is centred on the screen with the same measurements as on the Spectrum. Colour is what changes most: CPC mode 1 has four inks for the whole screen, and the first two belong to the text (black and white). The other two are picked for each picture from the colours that cover the most area, and each line, fill or shade is drawn with the ink closest to its colour on the Spectrum. The coloured backgrounds of the Spectrum's character cells become coloured boxes at the start of the picture. A picture with many colours loses the least used ones. Bitmaps are left out on the CPC, because its interpreter only draws vector pictures.

  The character set is the project's own if it has one; otherwise, the CPC interpreter's.
- Commodore 64:
  - Disk (.d64), laid out like DAAD's own: the original loader, the graphics database, the interpreter and the database. Start it with `LOAD"*",8` and `RUN`; emulators do it on their own.
  - DAAD database (.ddb), placed for the C64 interpreter (3880h).

  There is room for about 35 KB of database and pictures. The C64 draws in high resolution with an ink and a paper per 8x8 cell, like the Spectrum, so vector pictures carry over almost command for command, colour clash included. They are centred on the wider screen. BRIGHT gives the C64's light colours (light blue, light red, light green); where the Spectrum has a normal and a bright version of a colour the C64 lacks (yellow, cyan, magenta), both come out the same. Bitmaps are left out, because the interpreter only draws vector pictures. The character set is the project's own if it has one; otherwise, the C64 interpreter's.
- MSX:
  - Cartridge (.rom): the interpreter, the database and the graphics, with a start-up routine of our own (`z80/msxcart.asm`) that does what DAAD's loader did under MSX-DOS, without MSX-DOS. It works in any MSX emulator, C-BIOS included (the free BIOS many of them ship with), and on a real MSX with 64 KB of RAM and a flash cartridge. It is a 128 KB cartridge with an ASCII16 mapper.
  - DAAD database (.ddb), placed for the MSX interpreter (0100h).

  There is room for about 42 KB of database and pictures. DAAD on the MSX uses the same drawing commands as the Spectrum, so vector pictures carry over almost unchanged: INK and PAPER switch to MSX colours (brightness included) and BRIGHT and FLASH are dropped; a BRIGHT that on the Spectrum brightens a cell already drawn does not do so on the MSX. Bitmaps are left out, because the interpreter only draws vector pictures. The character set is the project's (or DAAD's), for shades too.
- PC (MS-DOS):
  - Folder for DOSBox (.zip): the interpreter, the database, the pictures, the character set, `PLAY.BAT` (`JUGAR.BAT` for Spanish) and a short readme. Unzip it and drag `PLAY.BAT` onto DOSBox. On a PC with MS-DOS, just type `PLAY` in that folder.
  - 1.44 MB floppy disk (.img) with the same files, for PC emulators. It is not bootable: start MS-DOS or FreeDOS from another disk and type `PLAY` on drive A:.
  - DAAD database (.ddb), in the PC's 16-bit format.

  It plays in VGA, or in EGA or CGA when there is no VGA. Pictures work as on the ST and the Amiga (see below).
- Atari ST:
  - 720K disk (.st) with the interpreter, the database, the pictures and the character set. It starts by itself with EmuTOS (the free TOS many emulators ship with) and with TOS 1.04 or later; with an older TOS, open `EDI1.PRG` (`SDI1.PRG` for Spanish) from the desktop. It needs a colour monitor, in low resolution.
  - DAAD database (.ddb), in the ST's 16-bit format.
- Amiga:
  - 880K disk (.adf) with the interpreter, the database, the pictures and the character set. It starts by itself when inserted in the drive.
  - DAAD database (.ddb), in the Amiga's 16-bit format.

  On the PC, the ST and the Amiga pictures are 16-colour images, not vector commands, and the database can grow up to 64 KB. Vector pictures are drawn as on the Spectrum and stored as images; bitmaps come from the original image reduced to 16 colours (dithered when needed) or, if there is none, from their Spectrum version. Each picture takes the same place as on the Spectrum. Text uses the project's character set, in 6-pixel columns as on the Spectrum, so a line holds 53 of them.

## Import

- ZX Spectrum DAAD games (.tap, .tzx, .z80, .sna and +3 .dsk disks), from both versions of DAAD: vocabulary, texts, processes, objects, connections, pictures and character set. The colour table of the graphics is applied to INK, PAPER and BORDER, since the project uses the plain one.
  - The first version of DAAD (the one used in 1989 games such as La Aventura Original) had the game loop inside the interpreter, like PAW: describe the location, run process 1 after it, process 2 before each order, process 0 with the responses and, if nothing did anything, the connections. On import that loop moves into the project's processes, together with the flags the interpreter counted down by itself and flag 40, which told whether the location had a picture. Condacts that changed in version 2 (INVEN, DESC, TURNS, SCORE, PICTURE, PROMPT, RESET, TIMEOUT, COPYOF and the other COPY ones) are written with version 2 ones. What doesn't stay the same: in running object lists, DAAD 1 turned «un» and «una» into «el» and «la»; INVEN lists objects with LISTAT, not one per line; GRAPHIC and EXTERN have no equivalent.
  - On a +3 disk the code files are loaded at their address. If the disk has a format of its own, the game is looked for in the raw track contents. When there are several parts, you choose which one to import.
  - Tapes with a custom loader (turbo, protected, headerless blocks) give "unsupported file format".
- DAAD games for the Atari ST (.st), Amiga (.adf, OFS or FFS), PC (.img floppy, or the game folder in a .zip) and MSX (the .rom cartridge Rocinante makes, or an MSX-DOS disk): each .DDB file on the disk is a part, with its graphics in the .DAT (or the .MDG on the MSX) and its character set in the .CHR of the same name.
  - The 16-colour images of the ST, Amiga and PC become Spectrum bitmaps in the same place (whatever doesn't fit in the Spectrum's 256x192 is shrunk), and the original image is kept as the master: the web page and the 16-bit exports use it, so they come out with their own colours again.
  - MSX vector pictures go back to Spectrum ones: their colours go through the file's own colour table.
  - Only DAAD version 2 and Rocinante's own exports have been tested: MSX-DOS disks and FFS .adf images are read by their format, with no original game to try them on. For a first-version DAAD game on these machines, the report warns that its support is experimental.
- DAAD games for the Amstrad CPC (.dsk disk or .cdt tape) and the Commodore 64 (.d64 disk or a .prg): each code file goes to its load address and the database is taken from there. No pictures yet. CPC tapes with a custom loader give "unsupported file format".
- ZX Spectrum PAW games (.z80, .sna, .tap or .tzx), 48K and 128K: vocabulary, texts, processes, objects, connections and pictures. The language is detected from the game. The game's character set comes along, and its graphic characters (UDGs, block graphics, ©) go into the slots of the Spanish letters it doesn't use. PAW condacts with no DAAD equivalent are translated or dropped (MODE, LINE, CHARSET, GRAPHIC) and the import report lists what changed.
- From a tape, each code block goes to the address in its header and, on 128K, to the memory bank the BASIC loader pages in before each LOAD ""CODE (OUT 32765 or POKE 23388). Tapes with their own loader (turbo, protected, headerless blocks) can't be placed that way: load them in an emulator and save a .z80 snapshot once the game starts.
- PAW pictures stay vector pictures, so a 48K game still fits in 48K. The format is almost the same as DAAD's; what changes on the way:
  - PAW shades with two of its 16 patterns and DAAD with a character, so each combination used becomes a character (codes 164 to 255).
  - TEXT in a PAW picture can use any of the game's fonts (or the ROM's); letters that differ from the project's character set get a character of their own in the same range.
  - PICTURE in PAW draws any picture; DAAD only shows location pictures, so the others are reached through an extra picture that calls them.
  - When a PAW picture goes off the screen, PAW stops it with ROM error B and carries on. DAAD would stop the game, so the picture is cut at the same point.
  - PRINTAT in PAW counts from the top of the screen and is translated to match.
  - QUIT in PAW, when the answer isn't yes, ends the entry as DONE does; in DAAD the next entry is tried. It is translated with a flag the game doesn't use and one more entry.
  - PAW's game loop is reproduced in the project's processes: flags 2, 3 and 4 count down when the location is described, and 5 to 10 after process 2 on every turn.

  `tools/pawcheck.py game.z80` draws every location picture with PAW's own code in the emulator and with Rocinante's, and compares them. On the 48K games it was tried with, all of them match pixel for pixel except one point where a picture goes off the screen. `tools/pawplay.py game.z80` plays the same commands (given ones, or random ones from the vocabulary) on the original PAW in the emulator and on Rocinante's engine, and compares the text word by word, randomness included: PAW and DAAD share the same generator. The original's text is read off the screen, so whatever the game clears with CLS before waiting for the player isn't seen and shows up as a difference.
- DAAD databases (.ddb), from both versions and from any of the machines: the header says which.

## Compatibility

Rocinante's JavaScript engine (`src/daad/engine.js`) and screen (`src/spectrum/daadscreen.js`) have been checked against the real DS48IS and DS48IE interpreters running in an emulator: text output matches character for character and screens match byte for byte on the cases in `test/cases`. That covers the parser (phrases, conjunctions, pronouns, adjectives, Spanish pronoun suffixes), DOALL, object lists, containers, windows, SAVE/LOAD and the "More..." prompt. The new-game templates, the 128K banked export, the pictures in 48K and 128K (bitmaps, and vector pictures including the ones the editor writes) and the tapes in .tap and .tzx (loaded through the ROM, as on a real Spectrum) are also run on the real interpreters in both languages. The vector pictures use a port of the interpreter's own fill routine, because shading and fills that leak have to match exactly.

The Amstrad CPC exports (disk, tape and tape sound) have been played on an emulated CPC with the original DCPCIE and DCPCIS interpreters, in both languages, and their pictures compared with the Spectrum ones. The same goes for the Commodore 64: the disk has been played in VICE with the original loader and the EDI64 and SDI64 interpreters. And the MSX: the cartridge has been played in openMSX, with C-BIOS on an MSX1 and an MSX2, with the MSXEDI and MSXSDI interpreters. And the PC: the folder and the floppy disk have been played in DOSBox with the INTEM1 and INTSM1 interpreters. And the Atari ST: the disk has been played in Hatari, with EmuTOS and the EDI1 and SDI1 interpreters. And the Amiga: the disk has been played in FS-UAE, on an A500 with Kickstart 1.3 and the edi1 and sdi1 interpreters.

## Layout

```
src/daad      DDB format (read and write), condacts, engine, 128K export
src/spectrum  interpreter bases, .z80 (read and write), exact screen
src/cpc       Amstrad CPC: interpreters, picture conversion, .dsk disks and .cdt tapes
src/c64       Commodore 64: loader and interpreters, picture conversion, .d64 disks
src/m68k      Atari ST and Amiga: interpreters, 16-bit database, pictures as images (PART1.DAT, the PC one too)
src/msx       MSX: interpreters, MDG graphics database, .rom cartridge
src/dos       PC (MS-DOS): interpreters, .zip folder and .img floppy disk
src/disk      FAT12 floppy disks (PC and ST) and .zip files
src/atari     Atari ST .st disks and autostart
src/amiga     Amiga .adf disks
src/gfx       image conversion, compression, vector pictures
src/import    import of classic games (Spectrum DAAD and PAW; DAAD for the other machines)
src/paw       PAW importer
src/project   editable project <-> DAAD model (compile and decompile), templates
src/player    published web page
src/ui        editor (Preact)
src/web       screen and I/O for the browser
src/i18n*.js  interface translations
z80           EXTERN routine (banks and pictures), tape loader and MSX cartridge start-up
tools         build, translation check and emulator tools
test          cases and comparisons with the real interpreters
docs          logo (SVG, and a 512 px PNG for the repository avatar) and how to set up the test environment
LICENSES      full licence texts (AGPL-3.0-or-later, MIT-0 and Preact's)
```

## Building

```
npm install
node tools/build.mjs
```

This writes `dist/rocinante.html`. The version is the one in `package.json`, shown at the foot of the side panel.

If you change anything in `z80/`, regenerate `src/daad/xbank-bin.js`, `src/spectrum/tapload-bin.js` and `src/msx/msxload-bin.js` with `node tools/genz80.mjs` (it needs pasmo).

Interface texts are written in Spanish in the code and translated in `src/i18n-en.js`. `node tools/i18n-check.mjs` lists any that are missing.

## Tests

```
npm test                  # JavaScript only: engine, screens, DDB, projects, vector commands and pieces, translations
tools/test-all.sh         # also runs every export on the real interpreters
```

`tools/test-all.sh` needs Python 3 with skoolkit (`pip install skoolkit`), which provides the emulator and `tap2sna.py`. The interpreters themselves are already in `ref/`. To set up the whole environment on Ubuntu 24.04, `tools/setup-ubuntu.sh`; the step by step, including the Amiga Kickstart, is in [docs/pruebas/README.md](docs/pruebas/README.md).

For the Amstrad CPC it also needs MAME and Pillow (`apt install mame`, `pip install pillow`) and the CPC 6128 and 464 ROMs, which `tools/setup-cpc.sh` puts in `.roms/` (they belong to Amstrad, who allow them to be distributed with emulators; they are not part of Rocinante). Without them that part is skipped. If the interpreters in `ref/cpc/` change, `node tools/mkcpcbase.mjs` regenerates `src/cpc/cpcbase.js`.

For the Commodore 64, VICE and Xvfb (`apt install vice xvfb`; Debian's VICE needs a display) and the C64 and 1541 ROMs, which `tools/setup-c64.sh` puts in `.roms/vice/` (not part of Rocinante either). `node tools/mkc64base.mjs` regenerates `src/c64/c64base.js` from `ref/c64/`.

For the MSX, openMSX and C-BIOS (`apt install openmsx cbios`); C-BIOS is free software, so no other ROM is needed. `node tools/mkmsxbase.mjs` regenerates `src/msx/msxbase.js` from `ref/msx/`.

For the PC, DOSBox, Xvfb and xdotool (`apt install dosbox xvfb xdotool`); no ROM is needed, since DOSBox has its own DOS. `node tools/mkdosbase.mjs` regenerates `src/dos/dosbase.js` from `ref/dos/`.

For the Atari ST, Hatari and Xvfb (`apt install hatari xvfb`) and EmuTOS, which `tools/setup-atari.sh` puts in `.roms/atari/` (EmuTOS is free software, GPL, but not part of Rocinante). `node tools/mkm68kbase.mjs` regenerates `src/m68k/m68kbase.js` from `ref/atari/` and `ref/amiga/`.

For the Amiga, FS-UAE, Xvfb and xdotool (`apt install fs-uae xvfb xdotool`) and the A500 Kickstart 1.3 in `.roms/amiga/kick13.rom`. The Kickstart belongs to Cloanto and cannot be downloaded freely: it comes, for example, with Amiga Forever. Without it, that part is skipped.

To add or change test cases (`test/gen.py`, `test/gen_en.py`) the reference transcripts have to be generated again, and that needs DRC to compile the test databases. `tools/setup-drc.sh` downloads and builds it in `.drc/` (it needs git, Free Pascal and PHP; DRC is GPL and is not part of Rocinante). Then:

```
python3 test/gen.py             # databases and reference transcripts (all cases, or the ones named)
node test/mksnap.mjs
python3 test/screens.py         # reference screens
```

The `ramload` and `whato2` cases don't come from DRC: Rocinante writes them with `node test/mkextra.mjs` (the file says how to produce their references).

The .wav files are checked twice: `tools/wavread.py` reads the blocks back from the sound, and the emulator loads the sound edge by edge through the ROM routine, with no shortcuts.

`tools/uitest.py es|en` walks through the interface with Playwright. `tools/vecui.py project.json picture es|en` tries the Select tool of the vector editor on a picture of a saved project. `tools/pawcheck.py` compares imported PAW pictures with the originals (see Import). `test/classic.py` plays the DAAD games in the `.clasicos/` folder (they don't come with Rocinante; you add your own) with the same orders in their original interpreter, in DAAD 2 after importing and exporting them, and in the JS engine, and compares the text and the pictures; the orders come from `game.txt` next to the game, or at random from its vocabulary.

## License

The editor is free software under the **GNU AGPL, version 3 or later**: it can be used, studied, changed and redistributed, also for money, but whoever distributes a modified version (or offers it to others over a network) has to provide its source code under the same licence.

What Rocinante puts inside the games it exports (the web page player, the DAAD engine in JavaScript, the Z80 routines, the loaders and boot files, and the contents of the new-game templates) is under **MIT-0**, which asks for nothing: **every author distributes their game as they like**, free or for sale, open or closed, without having to mention Rocinante. Games belong to whoever writes them.

`LICENSE` says exactly which files go with each licence, and the full texts are in `LICENSES/`. The DAAD interpreters embedded in exported games (Spectrum, Amstrad CPC, Commodore 64 with its loader, MSX, PC, Atari ST and Amiga) are public domain: Andrés Samudio, founder of Aventuras AD, placed DAAD in the public domain, and the interpreters come from the [daad-adventure-writer/DAAD](https://github.com/daad-adventure-writer/DAAD) repository. See `LICENSE`.
