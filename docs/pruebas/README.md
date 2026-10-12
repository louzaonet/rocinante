# Setting up the test environment on Linux

[Leer en castellano](LEEME.md)

Rocinante's full test suite (`tools/test-all.sh`) plays the exports on the original DAAD interpreters of each machine, inside emulators. It was built and checked on **Ubuntu 24.04 LTS on x86-64**; Debian 12 should work the same. On macOS only the JavaScript, Spectrum and CPC parts run (the rest need X11), and on a Raspberry Pi it depends on which emulators are packaged for ARM.

With everything installed, the full suite takes about 35 minutes on an ordinary desktop PC. Almost all of that is the Spectrum emulator, which is written in Python.

## The short version

```
git clone <the repository> rocinante
cd rocinante
tools/setup-ubuntu.sh        # packages, .venv, npm install and downloadable ROMs
. .venv/bin/activate
tools/test-all.sh
```

`tools/setup-ubuntu.sh` does everything that can be automated and says at the end what is missing. What can't be automated is covered below: the Amiga Kickstart (it has to be bought) and the classic games (you supply your own).

If something is missing for one machine, that part is skipped and the rest goes on. The only thing that stops the suite is a missing skoolkit, the Spectrum emulator.

## Step by step

### 1. System packages

```
sudo apt install python3 python3-venv python3-pip \
     mame vice openmsx cbios dosbox hatari fs-uae xvfb xdotool pasmo unzip curl
```

| Package | What for | Version it was checked with |
|---|---|---|
| `mame` | Amstrad CPC | 0.264 |
| `vice` | Commodore 64 (`x64sc`) | 3.7.1 |
| `openmsx` and `cbios` | MSX; C-BIOS is a free BIOS, no other ROM is needed | 19.1 |
| `dosbox` | PC (DOS); it brings its own DOS, no ROM needed | 0.74-3 |
| `hatari` | Atari ST | 2.4.1 |
| `fs-uae` | Amiga | 3.1.66 |
| `xvfb` and `xdotool` | virtual display and keyboard for the emulators that open a window (C64, MSX, PC, ST, Amiga) | |
| `pasmo` | only if you change anything in `z80/` (`node tools/genz80.mjs`) | 0.5.3 |

All of them are in the Ubuntu 24.04 repositories. The tests show no window: the emulators run on a virtual X server.

### 2. Node.js

The tests were made with **Node 22**. The `nodejs` in the Ubuntu 24.04 repository is version 18, which I haven't tried; the safe choice is Node 22 from NodeSource:

```
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install nodejs
```

(`tools/setup-ubuntu.sh` does this only when it finds no Node 20 or later.) Then, in the project folder:

```
npm install
```

### 3. Python: skoolkit and Pillow

Ubuntu 24.04 doesn't allow `pip` installs outside a virtual environment, so one is created in the project folder (`.venv/` is in `.gitignore`):

```
python3 -m venv .venv
. .venv/bin/activate
pip install skoolkit pillow
```

skoolkit is the Spectrum emulator that runs the DAAD interpreters in `ref/` (checked with 10.1); Pillow reads the screenshots of the other emulators. **Activate the environment before running the tests** (`. .venv/bin/activate`) in every new terminal.

### 4. ROMs that download themselves

```
tools/setup-cpc.sh      # CPC 6128 and 464, from Caprice32 (Amstrad allows distributing them with emulators)
tools/setup-c64.sh      # C64 and 1541 drive, from VICE's mirror on GitHub
tools/setup-atari.sh    # EmuTOS 1.4, the free (GPL) TOS, from SourceForge
```

They go into `.roms/`, which is in `.gitignore`. None of them is part of Rocinante.

### 5. The Amiga Kickstart 1.3 (has to be bought)

The Amiga part boots the disk on an emulated A500 in FS-UAE, and that needs Commodore's **Kickstart 1.3**, which still has an owner (Cloanto) and can't be downloaded freely. Without it that part is skipped and the suite still ends with "Todo bien", but the Amiga exports won't have been tried in the emulator.

The legal way to get it is to buy **Amiga Forever** from Cloanto, at [amigaforever.com](https://www.amigaforever.com/). The cheapest edition, the *Value Edition* (a Windows download), includes Kickstart 1.1, 1.2 and 1.3 and Workbench 1.3; the *Plus Edition* adds the rest. Either one will do. Another option, if you have an Android phone, is the *Amiga Forever Essentials* app on Google Play, which only ships the ROMs.

Once bought:

1. The ROMs are in the `Amiga Files/Shared/rom` folder of the installation (in Amiga Forever, File → Open Folder → Amiga Files). Kickstart 1.3 is `amiga-os-130.rom`.
2. Copy it to `.roms/amiga/kick13.rom` in the project folder:

   ```
   mkdir -p .roms/amiga
   cp "/path/to/Amiga Files/Shared/rom/amiga-os-130.rom" .roms/amiga/kick13.rom
   ```

3. If the file starts with the text `AMIROMTYPE1` (`head -c 11 .roms/amiga/kick13.rom`), it is encrypted, as in Amiga Forever versions before 8: also copy `rom.key` from the same folder to `.roms/amiga/` and to `~/Documents/FS-UAE/Kickstarts/`, where FS-UAE looks for the key. From Amiga Forever 8 on, the ROMs come decrypted.

If you have the Kickstart from another source (a dump of your own Amiga, say), any 256 KB Kickstart 1.3 will do; the one to use is the A500's revision 34.5, or Amiga Forever's, which is patched to be equivalent.

### 6. Classic games (optional)

`test/classic.py` imports the games in `.clasicos/` (also in `.gitignore`), exports them and plays the same commands on their original interpreter, on DAAD 2 and on Rocinante's engine, comparing text and screens. It takes `.tap` and `.tzx` tapes, `.z80` and `.sna` snapshots and +3 `.dsk` disks of Spectrum DAAD games (both versions). If a `.txt` with the same name sits next to a game, one command per line, those commands are played; otherwise 150 random ones drawn from its vocabulary.

The games don't come with Rocinante. If the folder doesn't exist or is empty, the test is skipped. To use another folder: `CLASICOS=/path tools/test-all.sh`.

## Running the tests

```
. .venv/bin/activate
npm test                     # JavaScript only: a few seconds
tools/test-all.sh --solo-js  # the same plus the slow JavaScript tests
tools/test-all.sh            # everything, with the emulators: about 35 minutes
```

`tools/test-all.sh` goes machine by machine and prints `Todo bien.` at the end; if anything fails it stops there with the details. Each part can be run on its own: `python3 test/cpc.py`, `python3 test/c64.py`, `python3 test/msx.py`, `python3 test/dos.py`, `python3 test/st.py`, `python3 test/amiga.py`, `python3 test/classic.py`. The Spectrum ones are `test/roundtrip.py`, `run128.py`, `runsnap.py`, `template.py`, `pictures.py`, `tapes.py` and `vector.py`.

## Tools outside the suite

- **The interface in the browser** (`tools/uitest.py es|en`, `tools/vecui.py`): they need Playwright with Chromium, inside the same virtual environment:

  ```
  pip install playwright
  playwright install --with-deps chromium
  ```

  The screenshots go to `/tmp/ui_es/` or `/tmp/ui_en/`.
- **PAW games** (`tools/pawcheck.py game.z80` for the pictures, `tools/pawplay.py game.z80` for the text): they only need skoolkit and node, already there.
- **Regenerating the reference files of the test cases** (`test/gen.py`, `test/gen_en.py`): this needs DRC, the DAAD compiler, which `tools/setup-drc.sh` downloads and builds in `.drc/` with `apt install git fpc php-cli`. Only needed when you change or add cases; not for running the suite.

## If something fails

- *`Falta skoolkit`*: the virtual environment isn't active (`. .venv/bin/activate`).
- *A part says it is skipped*: its emulator, the virtual X server or its ROM is missing; `tools/setup-ubuntu.sh` with no arguments (or `--sin-apt` if the packages are already there) checks what is and isn't present.
- *`mame` isn't found but it is installed*: on Debian it lives in `/usr/games`, which sometimes isn't in the `PATH` of sudo or cron. The tests also look for it there.
- *The C64 tests fail now and then*: VICE takes a while to start on slow machines; run `python3 test/c64.py` again.
- *The Amiga is skipped even though the Kickstart is there*: check the exact name, `.roms/amiga/kick13.rom`, and if it is encrypted, that `rom.key` sits next to it and in `~/Documents/FS-UAE/Kickstarts/`.
