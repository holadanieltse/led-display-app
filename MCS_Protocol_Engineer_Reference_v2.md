# MCS Protocol v3.1 — Engineer's Quick Reference (v2)

> **Read this file alone and you can code against MCS.** No need to read the full spec.
>
> **Context**: MCS controls LED ticker devices over TCP/IP. The Ticker project displays live stock data (logos, prices, up/down indicators) on LED screens.

---

## ⚠️ CRITICAL: No Command Queueing

**The sign controller has ZERO command buffer.** It does not queue commands. It can only process one command packet at a time.

- Send one packet → wait for it to finish processing → send the next.
- If you send a second packet before the first is done, **the second packet will be dropped or will corrupt the first**.
- You must respect the **Wait Time (WT)** per command type, or better yet, **wait for the `ok` response** before sending the next command.

> **Design rule**: The controller is synchronous. Treat it like a serial port where you wait for ACK before sending the next byte.

### Wait Times by Command Type

| Command Category | WT (seconds) | Why so long? |
|---|---|---|
| System (PO / PF / PR / CM) | 10 | Hardware state changes, full memory wipe |
| Font upload (FM/FW .lmf) | 30 | Large binary + font cache rebuild + restart |
| Config (WF / CCF) | 3–12 | Flash writes vary by key |
| Variable write (SM + B) | 3 | Flash write + variable parsing |
| Image upload (FM/FW .png) | 3 | Decoding + storing PNG |
| Playlist write (A / SM+A) | 3–4 | Restart + render pipeline rebuild |

### Best Practice: Use RA as a Ping

After the WT elapses, send a `RA` (read address) and wait for the response. If you get a response, the sign is ready for the next command. If not, it's still busy — wait longer and retry.

```
Send command → wait WT → send RA → got response? → send next
                                           ↓ no
                                        wait + retry (with timeout)
```

---

## 1. Packet Structure

### Envelope

```
^B{addr_list}^A{cmd}{data}[^D{4-hex-checksum}]^C
```

| Element | ASCII Name | Hex | Description |
|---|---|---|---|
| `^B` | STX | `$02` | Start of transmission. Address(es) follow. |
| `{addr_list}` | — | — | 2-hex-digit addresses, comma-separated. `"00"` = broadcast. `"01"` = single device. Example: `"01, 0A, 64"` |
| `^A` | SOH | `$01` | Start of command. **Reuse `^A` to chain multiple commands in one packet** (see below) |
| `{cmd}` | — | — | Single uppercase letter: `A`–`D` (see §2). Most commands in this project are `C` (special function, with a 2-letter sub-code) |
| `{data}` | — | — | Command payload (varies per command) |
| `^D` | EOT | `$04` | End of text. Optional — precedes the checksum |
| `{checksum}` | — | — | 4 hex digits. Sum mode (default) or CRC16 mode. See §6 |
| `^C` | ETX | `$03` | End of transmission |

### Chaining Commands Within One Packet

Multiple commands can be chained inside a single `^B...^C` envelope by repeating the `^A{cmd}{data}` part:

```
^B01^ACSM$F00$V99^ACB$F00$Hello^C
     └─┬──┘     └─┬──┘
       1st         2nd
```

This is the **only** way to send "multiple commands at once." Each `^A...` segment in the same packet is processed sequentially by the sign. The whole packet counts as **one** transaction — you wait one WT, not one per chained command.

### Two Protocol Modes

| Mode | Description |
|---|---|
| **Printable** | `^B` = literal caret + "B" (two bytes `5E 42`). All control codes are printable ASCII. **This is what the RISE Ticker uses.** |
| Binary | `^B` = actual STX character ($02), etc. Not used in this project. |

To send a literal `^` character in text content, use `^^`.

### Serial Specs (Background)

8 data bits, 1 stop bit, no parity. 9600 baud factory default. (The RISE project uses TCP/IP, not serial — included here only for context.)

---

## 2. Command Codes (Single Letter)

| Code | Name | Restarts? | Description |
|---|---|---|---|
| `A` | Write Text File | **Yes** | Write text/message file (causes full restart) |
| `B` | Write Variable File | No | Write variable file (live data, no restart) |
| `C` | Special Function | varies | 2-letter sub-commands: set memory, config, time, power, file I/O, etc. |
| `D` | Write Text No Restart | No | Write text file without restarting display |

> **Key insight for this project**: What looks like `^ACSM...` is actually `^A` (SOH) + `C` (command letter) + `SM` (2-letter sub-code). Nearly every command in the RISE Ticker is a **C-command with a 2-letter sub-code**.

---

## 3. Special Function Codes (Command "C")

Format: `^AC{sub_code}{data}`

### 3.1 Write-Only (No Response Expected)

| Code | Name | Format | Example | WT |
|---|---|---|---|---|
| `ST` | Set Time | `HHMMSS` | `^B01^ACST143052^C` | — |
| `SD` | Set Date | `MMDDYYYYX` (X=weekday 0-6) | `^B01^ACSD072620260^C` | — |
| `CM` | Clear Memory | (no data) | `^B01^ACCM^C` | 10s |
| `SM` | Set Memory | `{label}{type}{hex_size}` | `^B01^ACSM$F00$V99^C` | —* |
| `FM` | File Memory Allocate | `{NAME}.{EXT}={hex_size}` | `^B01^ACFMADBE.png=4c5^C` | —* |
| `FW` | File Write (Base64) | `{NAME}.{EXT}={base64}` | `^B01^ACFWADBE.png={base64}^C` | —* |
| `PO` | Power On | (no data) | `^B00^ACPO^C` | 10s |
| `PF` | Power Off | (no data) | `^B00^ACPF^C` | 10s |
| `PR` | Power Restart | `"0"` or `"1"` | `^B00^ACPR1^C` (1 = no startup screen) | 10s |
| `SR` | Set Run Sequence | file labels concatenated | `^B01^ACSRABC^C` | — |
| `SA` | Set Address | `AA` (2 hex digits) | `^B01^ACSA02^C` | — |
| `QR` | Quick Restart | (no data) | `^B01^ACQR^C` | — |

> *`SM`, `FM`, `FW` WT depends on the overall operation. See §5 and §7 for per-operation wait times.

### 3.2 Read Codes (Return a Response)

| Code | Name | Response Format |
|---|---|---|
| `RT` | Read Time | `HHMMSS` |
| `RD` | Read Date | `MMDDYYYYX` |
| `RA` | Read Address | `AA` — also works as a **ping** to check if sign is ready |
| `RM` | Read Memory | `UUUU-FFFF:FTSSSS[,FTSSSS,...]` |
| `RV` | Read Version | `WWWWHHHHCVV` (width, height, color type, version) |
| `FR` | File Read | Base64 file content |
| `FL` | File List | `FILE;FILE;...` (name.ext,size,time,attr) |

> Send a read command, then `recv()` on the socket to get the response. Only works with a single address (not broadcast `00`).

### 3.3 SM Command — Set Memory

```
SM{label}{type}{hex_size}
```

| Part | Description |
|---|---|
| `{label}` | File label. Single char (e.g. `A`) or `$LONGNAME$` (1-8 chars inside `$...$`) |
| `{type}` | File type: `T`=Text, `V`=Variable, `N`=Text no restart, `S`=Script |
| `{hex_size}` | Allocation size in hex (1-8 hex digits, up to `7FFFFFFF`) |

**Examples:**

```
SMAT237         label="A",  type=T (text),        size=0x237 (567 bytes)
SM$F00$V99      label="$F00$", type=V (variable), size=0x99  (153 bytes)
SMAN0           label="A",  type=N (text no-rst), size=0 (delete)
```

**Critical rules for SM:**

1. **SM only affects the NEXT write.** It doesn't allocate memory immediately — it sets the parameters for the very next `A`, `B`, `D`, or `E` write command.
2. **Size `0` deletes the file.**
3. Type `T` + `A` write = **restart after**. Type `N` + `D` write = **no restart**.

### 3.4 Configuration — Standard vs RISE-Specific

**Standard MCS v3.1 uses `CCF`:**

```
^B{addr}^ACCF{KEY}={VALUE}\r\n[{KEY}={VALUE}\r\n...]\^C
```

| Key | Value | Description |
|---|---|---|
| `brightness` | 0–255 | Brightness level |
| `brightmode` | 0 or 1 | 0=manual, 1=auto |

**RISE Ticker uses custom `WF` command:**

```
^B{addr}^ACWF{key}={value}^C
```

| Key | Value | Description |
|---|---|---|
| `brightness` | 0–100 | Brightness (percentage, not 0-255) |
| `enableautooff` | 0 / 1 | Auto power-off schedule |
| `enableautoon` | 0 / 1 | Auto power-on schedule |
| `adjustmcsfont` | 1 | Rebuild font cache after uploading .lmf files |

> ⚠️ **`WF` is NOT in the standard MCS v3.1 protocol.** It's a vendor extension in the RISE firmware. The standard equivalent is `CCF`.

---

## 4. Device Response

After each packet (addressed to a single device, not broadcast), the sign sends back:

- `ok` — all commands in the packet succeeded
- An error message (see below)

**No response when:**
- Address is `00` (broadcast)
- Multiple comma-separated addresses

### Error Messages

| Error | What It Means |
|---|---|
| `unknown command code` | Invalid command letter |
| `bad checksum` | Checksum didn't match — retransmit |
| `invalid file label` | Bad characters in file name |
| `invalid file size` | Bad hex size in SM / FM |
| `not enough memory` | Allocation failed — free space with CM or delete files |
| `file does not exist` | Writing to a file that wasn't allocated with SM / FM first |
| `file out of allocated size` | Data is bigger than allocated space (gets truncated) |
| `invalid hexadecimal number` | Bad hex value somewhere |
| `invalid time format` | ST command format wrong |
| `invalid date format` | SD command format wrong |
| `invalid address` | Address out of range (01–FF) |
| `bad command parameters` | Invalid parameter values |

> **If you get an error, stop.** Don't send the next command — figure out what went wrong first. Sending more commands on top of an error state can leave the sign in a bad state requiring a full `CM` reset.

---

## 5. File Upload — FM + FW Pair

Upload any binary file in **two chained commands** inside one packet:

```
^B{addr}^ACFM{NAME}.{EXT}={hex_size}^ACFW{NAME}.{EXT}={base64_content}^C
```

| Step | Command | What It Does |
|---|---|---|
| 1 | `FM{name}={hex_size}` | Allocate storage space for the file |
| 2 | `FW{name}={base64}` | Write the file content as Base64 |

### Standard File Extensions

| Extension | Type |
|---|---|
| `.txt` | Text file |
| `.var` | Variable file |
| `.sh` | Script file |
| `.bmp` | BMP image |
| `.gif` | GIF / animation |
| `.png` | PNG image |

### RISE-Specific Extensions (Not Standard)

| Extension | Type |
|---|---|
| `.lmf` | LED font file (vendor-specific binary format) |
| `.lst` | Font list file (`fonts.lst`) |

### After Font Upload (RISE-Specific)

```
^B00^ACWFadjustmcsfont=1^C    ← refresh font cache (custom command)
^B00^ACPR^C                    ← restart to apply (WT: 30s total)
```

### Uploading Multiple Files

**You cannot upload multiple files in one big batch.** Each file needs its own FM+FW packet + WT, because:

- The sign can only process one file write at a time (no queueing)
- Each write needs the full WT to flush to flash

```
Send file 1 FM+FW → wait WT → send file 2 FM+FW → wait WT → ...
```

---

## 6. Checksum (`^D`)

Optional but recommended for integrity. Appended **per command** (not per packet), right before `^C`.

### Sum Mode (default, used by RISE)

```
checksum = sum(all bytes from ^A to ^D inclusive) & 0xFFFF
```

Format: 4 uppercase hex digits.

**Worked example:**

```
Segment:   ^ACFMSS16.lmf=1560^D
Bytes:     5E 41 43 46 4D 53 53 31 36 2E 6C 6D 66 3D 31 35 36 30 5E 44
Sum:       0x059A
Result:    ^B01^ACFMSS16.lmf=1560^D059A^C
```

### CRC16 Mode

CRC16-CCITT over the same byte range (from `^A` to `^D` inclusive). Also 4 hex digits.

### Per-Command, Not Per-Packet

When chaining commands, each command segment gets its own `^D`:

```
^B01^ACFM{name}={size}^D{fm_chk}^ACFW{name}={base64}^D{fw_chk}^C
```

---

## 7. Variable Files (`$F{XX}$`)

Variable files are the key to live updates. They hold content that can be rewritten without touching the playlist.

### Lifecycle

```
1. Allocate:   ^B01^ACSM$F00$V{hex_size}^C
2. Reference:  ^N$F00$  ← put this inside the playlist (A file)
3. Update:     ^B01^ACB$F00$^{new_content}^C    (repeat as needed)
```

### Write Variable (B Command)

```
^B{addr}^ACB${label}${content}^C
```

- **No restart** — the variable updates on the next display cycle
- Content can use **all** the same control codes as a text file (fonts, colors, images, nested variables, etc.)
- Must be pre-allocated with `SM` (type `V`) before the first write

### How Many Variables?

In the RISE Ticker project, each stock gets its own variable:
- `$F00$` through `$F012$` — up to 13 stocks per playlist
- Each variable holds one stock's complete display block (logo + name + price + change + percent)

### Updating Variables at Runtime

To update stock prices, send only the `B` commands. No need to re-upload images or rewrite the playlist.

**Important**: Even though `B` writes are fast (WT ~3s), **they are still synchronous**. Send one variable update, wait for it to finish, then send the next. Don't blast all 13 variable updates back-to-back — the sign will drop them.

---

## 8. Control Codes (Inline Formatting)

Used inside text files (`A` / `D` commands) and variable files (`B` command). These are not separate commands — they're embedded in the content text.

| Code | Name | Syntax / Example | What It Does |
|---|---|---|---|
| `^G` | Mode Field | `^GM S` | Quick set: position (M) + effect (S) |
| `^E` | Effect | `^E$SCL1$` | Display effect: scroll, hold, flash, slide, roll |
| `^P` | Position | `^PM` or `^P$0,0,128,16,4$` | Display area / window position |
| `^F` | Font | `^F3` or `^F$SS16$` | Font selection. Index 0-4 or name |
| `^H` | Char Attr | `^H1`, `^H3`, `^H5` | Flash, wide, bold — can combine |
| `^I` | Speed | `^I3` | Scroll speed, 1 (slow) to 8 (fast). Default: 3 |
| `^J` | Pause | `^J05` | Pause time in seconds (2 hex digits). `FF` = forever |
| `^K` | Time/Date | `^K19` | Embed live time/date (many format options) |
| `^L` | New Page | `^L` | Page separator — starts a new display page |
| `^M` | New Line | `^M` | Line break for multi-line signs |
| `^N` | Variable | `^N$F00$` | Embed variable file content |
| `^O` | Color | `^O$RED$` or `^O$F:#FF0000, B:#00FF00$` | Foreground + background color |
| `^Q` | Coord Ref | `^Q0` | Coordinate reference mode (affects ^P) |
| `^R` | Sensor | `^R0` | Temperature, humidity, counters, stopwatches |
| `^S` | Image/Include | `^S$logo.png$` | Embed image or include another text file |
| `^T` | Tab | `^T0` or `^T$0,100$` | Tab alignment (left/right/center/decimal) |
| `^U` | Settings | `^U4` or `^U$1,32$` | Alignment, tab size, char spacing, line spacing, word wrap |
| `^V` | Beep | `^V1` | Beep (4 patterns) |
| `^W` | Two-Line Mode | `^W0` | ⚠️ **RISE-SPECIFIC** — not in standard MCS v3.1 |

### Common Effect Codes (`^E`)

| Code | Name | Notes |
|---|---|---|
| `S` / `$SCL1$` | Scroll Left | Default. Right-to-left scrolling. Number = variant/speed |
| `H` / `$HLD$` | Hold | Stationary display |
| `F` / `$FLS$` | Flash | Stationary + blinking |
| `A`/`B`/`C`/`D` | Slide Up/Dn/L/R | Slide-in transition |
| `a`/`b`/`c`/`d` | Roll Up/Dn/L/R | Roll transition (wraps around) |

### Color (`^O`) — Three Formats

| Format | Example | Notes |
|---|---|---|
| Indexed | `^O0` | 0=red, 1=green, 2=amber, 3=rainbow |
| Named | `^O$RED$`, `^O$WHT$`, `^O$GRN$` | `$ACL$` = auto, `$RB1$`–`$RB6$` = rainbows |
| RGB | `^O$F:#FF0000, B:#000000$` | F = foreground, B = background. Also `rgb(255,0,0)` format |

### Fonts (`^F`)

**By index** (standard MCS): `^F0`=SS7, `^F1`=SF7, `^F2`=SF10, `^F3`=SS16, `^F4`=SF16

**By name**: `^F$SS16$`, `^F$SF16$`, `^F$TM16$`, `^F$AR16$`, `^F$SMA$`

**RISE adds many more** via .lmf files: SS8, SS10, SS12, SS15, SS20, SS24, SS28, SS32, SS48, SS56, SS64, etc.

---

## 9. Stock Display Block Anatomy

Each stock occupies one variable file. Here's what the `B` command writes:

```
^S$ADBE0.png$              ← 1.  company logo image (must be uploaded via FM/FW)
^W0                        ← 2.  start two-line mode (RISE-specific)
^F$SS16$                   ← 3.  16px font
^O$F:#FFFFFF$              ← 4.  white text
Adobe Inc.                 ← 5.  company name (top line)
^M                         ← 6.  move to bottom line
^F$SS16$                   ← 7.  16px font for price line
^O$F:#FF0000$              ← 8.  red = price is down (use #00FF00 for up)
394.55                     ← 9.  current price
^S$DOWN.png$               ← 10. down arrow icon
3.26                       ← 11. price change amount
^O$F:#FFFFFF$              ← 12. back to white
(^O$F:#FF0000$0.82%^O$F:#FFFFFF$)   ← 13. percentage in red, parens in white
^L                         ← 14. end this page → next stock begins
^F$SS32$                   ← 15. 32px font as spacer / separator
```

### Playlist References Variables

The playlist (A file) embeds variables with `^N`. At render time, each `^N$F{XX}$` is replaced with the current content of that variable:

```
^B01^ACSMAT237^AAA^E$SCL1$^I1^S$NASDAQ10.png$^F$SS32$  ^N$F00$^N$F01$...^N$F012$  ^C
```

This is why you can update prices just by sending `B` commands — the playlist itself never changes.

---

## 10. Complete Finance Publish Flow

### Initial Deploy (Fresh Device)

> ⚠️ **Each step waits for its WT before moving to the next.** No queueing.

| # | Command | WT | Purpose |
|---|---|---|---|
| 1 | `^B01^ACCM^C` | 12s | Clear all memory (full wipe) |
| 2 | `^B01^ACSMAT38^AAA^E$SCL1$Content is downloading.... ^C` | 4s | Show "downloading" message |
| 3 | `^B01^ACWFenableautooff=0^ACWFenableautoon=0^C` | 12s | Disable auto power schedule |
| 4 | `^B01^ACWFbrightness=55^C` | 3s | Set brightness |
| 5 | `^B01^ACSMAT237^AAA^E$SCL1$^I1^S$NASDAQ10.png$^F$SS32$ ^N$F00$...^N$F012$ ^C` | 3s | Write playlist with variable placeholders |
| 6a | `^B01^ACFMUP.png=9f^ACFWUP.png={base64}^C` | 3s | Upload UP arrow icon |
| 6b | `^B01^ACFMDOWN.png=9f^ACFWDOWN.png={base64}^C` | 3s | Upload DOWN arrow icon |
| 6c+ | For each stock logo: `^B01^ACFM{TICKER}.png={size}^ACFW{TICKER}.png={base64}^C` | 3s each | Upload all company logos |
| 7+ | For each stock: `^B01^ACSM$F{XX}$V{size}^ACB$F{XX}$^{block}^C` | 3s each | Allocate + write each variable |

### Runtime Updates (Daily / Real-Time)

Only send the `B` commands for stocks that changed. No need to repeat steps 1-6:

```
^B01^ACB$F00$^S$ADBE0.png$ ^W0^F$SS16$^O$F:#FFFFFF$Adobe Inc.^M^F$SS16$^O$F:#FF0000$394.55 ^S$DOWN.png$3.26 ^O$F:#FFFFFF$(^O$F:#FF0000$0.82%^O$F:#FFFFFF$)^L^F$SS32$  ^C
```

Send one, wait WT, send next. **Don't batch them.**

### Heartbeat Loop

```
if LastMessageReceivedAt > 5 min:   close TCP connection
if LastTimeUpdateAt > 1 hour:       send ^B00^ACST{HHmmss}^ACSD{MMddYYYY}^C
if LastMessageSendAt > 1 min:        send ^B01^ACRA^D{chk}^C   (check if sign is still alive)
```

---

## 11. Python Code Patterns

### 11.1 Send with Wait (Correct Pattern)

```python
import socket
import time

def send_and_wait(ip: str, port: int, command: str, wait_sec: float,
                  expect_response: bool = True) -> str | None:
    """Send one command, wait for response or WT, return response.
    
    This is the ONLY safe pattern. Never send two commands back-to-back
    without waiting in between — the sign has no command queue.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(10)
        s.connect((ip, port))
        s.sendall(command.encode("ascii"))
        
        if expect_response:
            try:
                response = s.recv(4096).decode("ascii", errors="replace")
                return response.strip()
            except socket.timeout:
                return None
        else:
            # Broadcast or write-only — just wait the WT
            time.sleep(wait_sec)
            return None
```

### 11.2 Build Packets

```python
def build_packet(address: str, segments: list[str]) -> str:
    """Chain multiple command segments into one packet."""
    return f"^B{address}" + "".join(segments) + "^C"

def seg_c(sub_code: str, data: str = "") -> str:
    """Build a C-command (special function) segment."""
    return f"^AC{sub_code}{data}"
```

### 11.3 Upload a File

```python
import base64
import os

def build_file_upload(filepath: str) -> tuple[str, str]:
    """Returns (filename, full FM+FW packet data segment).
    Use like: build_packet("01", [seg_c(f"FM{name}={size}"), seg_c(f"FW{name}={b64}")])
    """
    with open(filepath, "rb") as f:
        data = f.read()
    filename = os.path.basename(filepath)
    size_hex = format(len(data), "x")
    b64 = base64.b64encode(data).decode("ascii")
    return filename, f"FM{filename}={size_hex}", f"FW{filename}={b64}"

def upload_file(ip: str, port: int, filepath: str, address: str = "01") -> str:
    name, fm_data, fw_data = build_file_upload(filepath)
    packet = build_packet(address, [seg_c(fm_data), seg_c(fw_data)])
    return send_and_wait(ip, port, packet, wait_sec=3.0)
```

### 11.4 Allocate + Write Variable

```python
def build_variable_write(var_label: str, content: str) -> list[str]:
    """Return two segments: SM allocation + B write.
    Use like: build_packet("01", build_variable_write("$F00$", content))
    """
    size_hex = format(len(content.encode("ascii")), "x")
    return [
        seg_c(f"SM${var_label}$V{size_hex}"),
        seg_c(f"B${var_label}$") + content,
    ]
```

### 11.5 Stock Block Builder

```python
def build_stock_block(logo_file: str, name: str, price: str,
                      change: str, pct: str, is_up: bool) -> str:
    arrow = "UP.png" if is_up else "DOWN.png"
    color = "#00FF00" if is_up else "#FF0000"
    return (
        f"^S${logo_file}$ "
        f"^W0"
        f"^F$SS16$^O$F:#FFFFFF${name}"
        f"^M"
        f"^F$SS16$^O$F:{color}${price} "
        f"^S${arrow}${change} "
        f"^O$F:#FFFFFF$("
        f"^O$F:{color}${pct}%"
        f"^O$F:#FFFFFF$)"
        f"^L^F$SS32$  "
    )
```

### 11.6 Checksum — Sum Mode

```python
def checksum_sum(payload: bytes) -> str:
    """Sum mode: sum bytes from ^A to ^D inclusive, mask to 16 bits."""
    return f"{sum(payload) & 0xFFFF:04X}"

# Usage:
payload = b"^ACFMSS16.lmf=1560^D"
chk = checksum_sum(payload)  # → "059A"
packet = f"^B01{payload.decode()}{chk}^C"
```

### 11.7 Bulk Upload Pattern (Safe — One at a Time)

```python
def upload_all_files(ip: str, port: int, filepaths: list[str],
                     address: str = "01", wait_sec: float = 3.0):
    """Upload files one at a time, waiting between each."""
    results = []
    for fp in filepaths:
        name, fm_seg, fw_seg = build_file_upload(fp)
        packet = build_packet(address, [seg_c(fm_seg), seg_c(fw_seg)])
        resp = send_and_wait(ip, port, packet, wait_sec=wait_sec)
        results.append((name, resp))
        # Extra safety: ping to make sure sign is ready before next file
        ready = send_and_wait(ip, port, "^B01^ACRA^C", wait_sec=1.0)
        if not ready:
            time.sleep(2.0)  # give it more time
    return results
```

---

## 12. Cheat Sheet

```
PACKET:      ^B{addr}^A{cmd}{data}[^D{chk}]^C
CHAINING:    Repeat ^A{cmd}{data} inside one ^B...^C
             (counts as ONE transaction — one WT total)
NO QUEUE:    Send one packet → wait WT or response → send next
             Sign drops commands if it's still busy with the last one
CHECKSUM:    sum(bytes ^A..^D) & 0xFFFF → 4 hex digits (Sum mode)
             CRC16 also available. Per command, not per packet.

COMMANDS (single letter):
  A = write text file       (restarts after)
  B = write variable file   (no restart)
  C = special function      (2-letter sub-code, see below)
  D = write text no restart

SPECIAL FUNCTIONS (C-command sub-codes):
  Write:    ST=set time, SD=set date, CM=clear mem, SM=set mem (label+type+size)
            PO=power on, PF=power off, PR=restart, SR=run sequence, SA=set address
            FM=file mem alloc, FW=file write (base64), QR=quick restart
  Read:     RT=read time, RD=read date, RA=read addr (ping)
            RM=read mem, RV=read version, FR=file read, FL=file list

CONFIG:
  Standard:  ^ACCFbrightness=200\r\n^C
  RISE:      ^ACWFbrightness=55^C            (WF = custom, not standard)

CONTROL CODES (inline in text/variable content):
  ^G  mode field        ^E  effect          ^P  position
  ^F  font              ^H  char attrs      ^I  speed
  ^J  pause             ^K  time/date       ^L  new page
  ^M  new line          ^N  embed variable  ^O  color
  ^Q  coord ref         ^R  sensor          ^S  image/include
  ^T  tab               ^U  settings        ^V  beep
  ^W  two-line mode     ← RISE-SPECIFIC, NOT standard MCS

FILE TYPES:
  Standard:  .txt .var .sh .bmp .gif .png
  RISE-ext:  .lmf .lst   (vendor-specific)

ADDRESS:   00=broadcast (no response), 01..FF=device, comma-separated for multi
```
