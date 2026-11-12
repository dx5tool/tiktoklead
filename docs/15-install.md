# Installing XChange

> **There are releases; macOS ones are signed, Windows ones are not.** The
> [Releases](https://github.com/dx5tool/tiktoklead/releases)
> page has had builds since 18.08.2026; the current one is 0.4.20 for Windows x64
> and macOS on Apple Silicon. Each ships with
> `SHA256SUMS` and a `REPORT.md` — the measurement the core passed before it was
> published. Since 21.09.2026 the macOS application, core and disk image are
> signed with a Developer ID and notarised, so they open like any other
> download. The Windows installer is not signed and shows a SmartScreen
> warning, covered below. To build instead, the application and the agent take minutes
> (`cargo build --release`) and the core about three hours
> ([docs/03](03-chromium-fork.md)).
>
> This page was written before the first release existed, because the
> instructions are the specification — what a release has to produce is exactly
> what this page promises. It now describes what the releases do.

For a person who has not built anything. If you want to build from source, that
is [docs/03](03-chromium-fork.md) and the README; this page assumes you have a
computer and a browser and nothing else.

XChange is **two downloads**, and that is worth understanding before you start,
because otherwise the second one looks like a mistake:

| | what it is | size |
|---|---|---|
| **XChange** | the application: profiles, proxies, personas, teams | ~12 MB |
| **XChange core** | the browser itself — a Chromium fork | 103 MB on macOS, 146 MB on Windows |

They are apart because they move apart. The application changes weekly; the core
changes when Chromium does, every six weeks or so. Bundling them would mean a
100-plus MB download every time a button moved. It also keeps the application's code
signature intact — a core written into a signed bundle breaks its seal, after
which macOS says the application is *damaged*, which sends you looking for a
corrupt download rather than at us.

## macOS

### 1. The application

Download `xchange-<version>-macos-<arch>.dmg` from
[Releases](https://github.com/dx5tool/tiktoklead/releases). `arch` is `arm64` for
any Apple-silicon Mac (M1 and later) — if you are not sure,  → About This Mac
says which. Intel Macs have no release build yet: the name would be `x86_64`,
and until one is published the way in on an Intel machine is to build it.

Open it and drag **XChange.app** into `/Applications`, the way every other Mac
application is installed.

### 2. The browser core

Open XChange. It says the browser itself is not installed yet and offers
**Download the browser** — press it. That fetches the core for this machine
from the Releases page, about 100 MB, once, and installs it. Nothing runs on a
timer or at startup: the request is made when you press the button and not
otherwise, which is the difference between this and the automatic updates the
project refuses to have (the reasons are at the bottom of this page).

Or by hand: download `xchange-core-<version>-macos-<arch>.tar.xz` from the same
page, then in Terminal:

```bash
/Applications/XChange.app/Contents/MacOS/xchange-agent install-core ~/Downloads/xchange-core-*.tar.xz
```

The button runs exactly this. It does three things by hand that are easy to get
wrong: it unpacks the bundle preserving the symlinks a macOS framework is built
from, it removes the quarantine flag your browser attached to the download, and
— the step that matters — it **runs the browser once and checks it starts**.
If it prints a version, it is installed:

```
installed XChange 155.0.8059.39
  /Users/you/Library/Application Support/XChange/core.bundle/Fury.app/Contents/MacOS/Fury
```

Ask it at any time what is installed:

```bash
/Applications/XChange.app/Contents/MacOS/xchange-agent install-core
```

### 3. Open it

Open XChange from Applications. There is no account, no sign-up and no server: it
starts working immediately, and everything stays on this machine.

Team features — shared profiles, a shared proxy pool, per-project access — are
in **Settings → Team server**, which is also where you create an account and
where the instructions for running your own server are. The sign-up screen
comes with the project's open server already filled in; a team with a server of
its own replaces the address. That is a decision you can make
later, or never.

### Verifying what you downloaded

Every release has a `SHA256SUMS` file. Download it next to the archives and:

```bash
shasum -a 256 -c SHA256SUMS
```

Two `OK` lines mean the files are what was published.

### If macOS refuses to open it

**It should not, from 0.1.4's re-upload of 21.09.2026 on.** The application,
the core and the disk image are signed with a Developer ID and carry a stapled
notarisation ticket; `spctl --assess` on a machine that has never seen them
answers `accepted, source=Notarized Developer ID`. If a current download is
refused, the file is not what was published — check it against `SHA256SUMS`
before anything else.

What follows is for **0.1.3 and earlier**, which were ad-hoc signed, and for
a bundle you built yourself.

**"XChange cannot be opened because the developer cannot be verified."** This is
the normal result for an unsigned application, and it is what you should expect
for the *correct* file — an earlier version of this page told you to download it
again, which was a loop with no exit. Instead:

  1. Try to open it once and dismiss the dialog. Then System Settings →
     Privacy & Security, scroll to the bottom: next to *"XChange" was blocked* press
     **Open Anyway** and confirm. macOS remembers the choice for that copy.
     (Right-click → **Open** used to be enough; since macOS 15 it is not.)
  2. Or strip the quarantine flag in Terminal, which is what the dialog is
     really about:

     ```bash
     xattr -dr com.apple.quarantine /Applications/XChange.app
     ```

The same applies to the core: `xchange-agent install-core` removes the flag from
what it unpacks, which is why the core needs no step of its own here.

**"XChange is damaged and can't be opened."** On macOS 15 and later this is the
wording you get for an ad-hoc signed download, so it is the same case as above:
strip the quarantine flag and it opens. The release 0.1.2 bundle passes
`codesign --verify --deep --strict` on the machine it was built on, so the
signature itself is sound. If the message survives the `xattr` step, then the
seal is genuinely broken — something was added to or removed from inside
`XChange.app` — and the fix is to delete it and unpack the download again.

**A core you built yourself will not start**, with a message about *Team IDs*.
That is a signing arrangement rather than a broken build; see
[tools/release/sign-core.sh](../tools/release/sign-core.sh), which explains it
in full.

## Windows

Works, as of 16.08.2026, and in the releases since 0.1.1. An earlier version of
this section said "not yet" for as long as that was true: the launcher was
ported first, and the core — the Chromium build — was the part nobody had run on
a Windows machine. It has been run now, and `tools/verify-windows.ps1` passes
30 claims against it on a real machine. The same two downloads as on macOS.

### 1. The application

Download `xchange-<version>-windows-x64-setup.exe` from
[Releases](https://github.com/dx5tool/tiktoklead/releases)
and run it. **SmartScreen will object** — "Windows protected your PC" — because
the installer is not signed, not because anything is wrong with it. Press
**More info**, then **Run anyway**.

The installer asks for nothing: it installs for the current user, into
`%LOCALAPPDATA%\XChange`, and needs no administrator password. That directory
holds `xchange-desktop.exe`, `xchange-agent.exe` and the uninstaller, and nothing
else.

### 2. The browser core

Open XChange and press **Download the browser**, the same button as on macOS: it
fetches `xchange-core-<version>-windows-x64.tar.xz` from Releases, about 150 MB,
once, and installs it. Or by hand — download that file from the same page and,
in PowerShell:

```powershell
& "$env:LOCALAPPDATA\XChange\xchange-agent.exe" install-core "$env:USERPROFILE\Downloads\xchange-core-<version>-windows-x64.tar.xz"
```

On Windows the install step reads the version out of the executable instead of
running it: `chrome.exe --version` starts a browser and never exits.

### 3. Open it

Open XChange from the Start menu. Everything the macOS section says about accounts
applies: there are none until you want a team.

**Widevine** — Netflix, Spotify and the other DRM sites — is not in the
download, because it cannot be redistributed. The agent stages it out of the
Chrome already installed on the machine; a machine with no Chrome gets a
working browser without DRM, and a site that checks for it will notice.

## Linux

Not a target. This is a decision rather than a gap, and it is worth stating
plainly because an earlier version of this page promised a Linux release.

The Rust still compiles on Linux — CI runs there and contributors can run the
test suite — but there is no packaged release, no build configuration for the
core, and no plan for one. Two platforms that get tested are worth more than
three where one is a guess.

## Where things are kept

Everything XChange owns is under one directory, so "back it up" and "remove it" are
each one operation:

```
~/Library/Application Support/XChange/
  xchange.db          profiles, proxies, personas, projects
  profiles/        each profile's browser data — cookies, tabs, bookmarks
  core.bundle/     the installed browser (a package, so search
                   shows one XChange rather than two)
```

On Windows the same directory is `%APPDATA%\XChange` — Roaming rather than
Local, deliberately: on a domain-joined machine it follows the user, and
losing the database on a different machine would look like data loss rather
than a cache miss.

Set `FURY_HOME` to put it somewhere else — an external disk, or an encrypted
volume.

### A second place for profile data

Settings → Data → Storage can name a folder for **new** profiles, which is how an
operator with hundreds of them uses a second disk without moving the database or
the browser. Two rules make it safe:

- A profile already on disk **keeps its folder**. Changing the root never moves
  anything; the folder each profile uses is recorded when it is first launched,
  and that record wins from then on.
- A profile whose folder has disappeared is **refused**, not recreated. An
  unplugged drive therefore opens nothing rather than opening an empty browser
  that looks like a logged-out account while the real cookie jar sits on the
  disk.

The folder must be on NTFS (Windows) or APFS/HFS+ (macOS). Cookie jars are
protected by permissions that FAT and exFAT do not have, and XChange refuses such a
folder rather than accepting one it cannot lock down.

**What this means for backup:** `xchange.db` still lives in the data directory and
still describes every profile, including the ones filed elsewhere. Back up the
data directory *and* every folder you named in Storage, or a restore will list
profiles whose data is missing. To remove XChange completely, delete the data
directory, every profile folder you chose, and `/Applications/XChange.app` — on
Windows, those and XChange from Settings → Apps.
Nothing is written anywhere else, and nothing is left behind on any server you
did not set up yourself.

## Updating

From 0.3.0 the bar that says a new version is out has an **Update** button:
XChange downloads the new version, checks its signature, installs it and restarts.
Profiles, proxies and settings stay. Close open profiles first; the button
says so if they are open. Before 0.3.0, and whenever you prefer to do it by
hand: download the new `.dmg` and drag the application over the old one. For a new core, run
`install-core` again with the new archive — it verifies the new one starts
before it replaces the one you have, so a bad download leaves you with a working
browser rather than none.

## How the Update button is kept safe

An updater is a channel into an anti-detect browser, so this one is built to
be no wider than a person downloading the installer themselves:

- **Nothing installs on its own.** The check only shows the bar; the install
  starts when you press the button, never on a schedule.
- **Only a build signed with the project's key installs.** Every release
  carries `latest.json` and a minisign signature for each platform's build; the
  application checks it against the public key it was built with, before it
  stops anything. A changed file, a different key or a release without a
  signature is refused, and the button falls back to the download link. The
  private key lives on the release machine and nowhere else.
- **Open profiles are never interrupted.** The button refuses while any is
  open; the background service is stopped only after the download has been
  verified.
- The download comes from GitHub over this machine's own connection, like the
  check, not through a profile's proxy.
