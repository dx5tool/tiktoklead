#Requires -Version 5.1
<#
.SYNOPSIS
Reads, exports or restores the XChange vault key in Windows Credential Manager.

.DESCRIPTION
XChange seals proxy passwords, rotation links and login secrets (password, TOTP
seed, session cookie) in xchange.db with a 32-byte key kept as the generic
credential "vault-key.dev.xchange.agent". A Windows reinstall removes that entry,
and every sealed value in a restored xchange.db then reads back empty - the Login
tab still lists the rows, with no password.

Export the key while the old installation still works, and restore it on the
new machine BEFORE XChange runs for the first time. XChange creates a new key on
first use if none is there, and the old ciphertext cannot be opened with it.

.PARAMETER Target
Credential Manager target name. The default is the one XChange uses.

.PARAMETER Export
Path to write the key to. The file is a secret - keep it off shared drives.

.PARAMETER Import
Path to a file written by -Export.

.PARAMETER PassThru
Print the key. Off by default: a key on the console ends up in scrollback.

.EXAMPLE
.\vault-key.ps1

Reports whether the key exists and decodes to 32 bytes.

.EXAMPLE
.\vault-key.ps1 -Export D:\xchange-vault-key.txt

.EXAMPLE
.\vault-key.ps1 -Import D:\xchange-vault-key.txt

Run this before starting XChange on the reinstalled machine.
#>
[CmdletBinding()]
param(
    [string]$Target = "vault-key.dev.xchange.agent",
    [string]$Export,
    [string]$Import,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

if ($Export -and $Import) {
    throw "Choose -Export or -Import, not both."
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class XChangeVaultCred
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL
    {
        public uint Flags;
        public uint Type;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetName;
        [MarshalAs(UnmanagedType.LPWStr)] public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetAlias;
        [MarshalAs(UnmanagedType.LPWStr)] public string UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);

    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite(ref CREDENTIAL credential, uint flags);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr buffer);
}
'@

$CRED_TYPE_GENERIC = 1
$CRED_PERSIST_LOCAL_MACHINE = 2

function Read-VaultKey {
    $ptr = [IntPtr]::Zero
    if (-not [XChangeVaultCred]::CredRead($Target, $CRED_TYPE_GENERIC, 0, [ref]$ptr)) {
        $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "No credential '$Target' (Win32 $code). XChange has not created its vault key on this machine."
    }
    try {
        $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [Type][XChangeVaultCred+CREDENTIAL])
        $blob = New-Object byte[] $cred.CredentialBlobSize
        if ($cred.CredentialBlobSize -gt 0) {
            [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $blob, 0, $blob.Length)
        }
        $key = [Text.Encoding]::UTF8.GetString($blob)
        # A blob written as UTF-16 would arrive with a NUL after every character.
        if ([Array]::IndexOf($blob, [byte]0) -ge 0) {
            $key = [Text.Encoding]::Unicode.GetString($blob)
        }
        return $key.Trim([char]0).Trim()
    }
    finally {
        [XChangeVaultCred]::CredFree($ptr)
    }
}

function Assert-VaultKey([string]$Key) {
    try {
        $raw = [Convert]::FromBase64String($Key)
    }
    catch {
        throw "The value is not base64, so it is not a XChange vault key."
    }
    if ($raw.Length -ne 32) {
        throw "The key decodes to $($raw.Length) bytes; XChange's key is 32."
    }
    return $raw.Length
}

function Write-VaultKey([string]$Key) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Key)
    $mem = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    try {
        [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $mem, $bytes.Length)
        $cred = New-Object XChangeVaultCred+CREDENTIAL
        $cred.Type = $CRED_TYPE_GENERIC
        $cred.TargetName = $Target
        $cred.UserName = "vault-key"
        $cred.CredentialBlob = $mem
        $cred.CredentialBlobSize = [uint32]$bytes.Length
        $cred.Persist = $CRED_PERSIST_LOCAL_MACHINE
        if (-not [XChangeVaultCred]::CredWrite([ref]$cred, 0)) {
            $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            throw "CredWrite failed for '$Target' (Win32 $code)."
        }
    }
    finally {
        for ($i = 0; $i -lt $bytes.Length; $i++) { $bytes[$i] = 0 }
        [Runtime.InteropServices.Marshal]::FreeHGlobal($mem)
    }
}

if ($Import) {
    $path = (Resolve-Path -LiteralPath $Import).Path
    $key = (Get-Content -LiteralPath $path -Raw).Trim()
    $null = Assert-VaultKey $key
    Write-VaultKey $key
    Write-Output "Restored the vault key into '$Target'. Start XChange only after this."
    exit 0
}

$key = Read-VaultKey
$size = Assert-VaultKey $key

if ($Export) {
    $path = [IO.Path]::GetFullPath($Export)
    $dir = [IO.Path]::GetDirectoryName($path)
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        $null = New-Item -ItemType Directory -Path $dir
    }
    Set-Content -LiteralPath $path -Value $key -Encoding Ascii -NoNewline
    Write-Output "Wrote the vault key to $path ($size bytes)."
    Write-Output "This file opens every secret in xchange.db - keep it off shared drives, and delete it once the new installation is restored."
    if ($PassThru) { Write-Output $key }
    exit 0
}

Write-Output "Vault key present at '$Target' ($size bytes)."
if ($PassThru) { Write-Output $key }
