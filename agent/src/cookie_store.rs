// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

//! Reading a profile's cookie jar without starting a browser.
//!
//! A local profile on Windows writes its cookies as `v10` rows: AES-256-GCM
//! under a key the browser keeps in `Local State`, wrapped with DPAPI for this
//! user. The agent runs as the same user, so it can unwrap that key and decrypt
//! the rows itself — the jar is a file, and exporting it needs neither a
//! browser, nor a relay, nor the profile's proxy.
//!
//! The read never writes to the profile: the database and its WAL are copied
//! to a scratch directory first, so SQLite cannot checkpoint or lock the live
//! one, and an export costs the profile nothing.
//!
//! Only `v10` is handled on purpose. A team profile uses the core's own `f10`
//! key tag (which this machine does not have without the organisation key), and a
//! build that writes app-bound `v20` cookies cannot be opened outside the
//! browser at all — both fail here and the caller falls back to the launch
//! path, which is the behaviour that existed before this module. The format is
//! Chromium's own: three tag bytes, a 12-byte nonce, then ciphertext and tag;
//! the plaintext is `SHA256(host_key) || value`, and the hash is checked so a
//! row decrypted under the wrong key is refused rather than exported as
//! garbage.

use std::path::Path;

use serde_json::Value;

const HOST_HASH_LEN: usize = 32;
/// Seconds between Chromium's epoch (1601-01-01) and the Unix epoch.
const EPOCH_DELTA: f64 = 11_644_473_600.0;

/// Every cookie in the profile, in CDP's `Network.Cookie` shape so the export
/// file is byte-for-byte the format the browser route produces.
///
/// Returns an error when the jar cannot be read exactly — a missing database,
/// a different encryption scheme, or one row that will not decrypt. The caller
/// uses that to fall back to the browser rather than write a partial jar.
pub async fn read(profile_dir: &Path) -> anyhow::Result<Vec<Value>> {
    #[cfg(windows)]
    {
        windows::read(profile_dir).await
    }
    #[cfg(not(windows))]
    {
        let _ = profile_dir;
        anyhow::bail!("reading the cookie store directly is only implemented on Windows")
    }
}

#[cfg(windows)]
mod windows {
    use std::path::{Path, PathBuf};

    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Nonce};
    use base64::Engine;
    use serde_json::{json, Value};
    use sha2::{Digest, Sha256};
    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::{Connection, Row, SqliteConnection};

    use super::{EPOCH_DELTA, HOST_HASH_LEN};

    pub(super) async fn read(profile_dir: &Path) -> anyhow::Result<Vec<Value>> {
        let db = profile_dir.join("Default").join("Network").join("Cookies");
        if !db.is_file() {
            anyhow::bail!("no cookie store at {}", db.display());
        }
        let key = local_state_key(profile_dir)?;
        let scratch = Scratch::copy(&db)?;

        let options = SqliteConnectOptions::new()
            .filename(scratch.path())
            .create_if_missing(false);
        let mut conn = SqliteConnection::connect_with(&options).await?;
        let rows = sqlx::query(
            "SELECT host_key, name, value, encrypted_value, path, expires_utc, \
                    has_expires, is_secure, is_httponly, samesite, priority, \
                    source_scheme, source_port \
             FROM cookies",
        )
        .fetch_all(&mut conn)
        .await?;
        let _ = conn.close().await;

        let mut cookies = Vec::with_capacity(rows.len());
        for row in &rows {
            cookies.push(cookie_from_row(row, &key)?);
        }
        Ok(cookies)
    }

    /// The key the browser encrypts this profile's cookies with.
    ///
    /// `Local State` stores it base64-wrapped with a `DPAPI` prefix; DPAPI
    /// unwraps it for this user, which is the same user the browser runs as.
    fn local_state_key(profile_dir: &Path) -> anyhow::Result<[u8; 32]> {
        let text = std::fs::read_to_string(profile_dir.join("Local State"))?;
        let state: Value = serde_json::from_str(&text)?;
        let encoded = state
            .get("os_crypt")
            .and_then(|v| v.get("encrypted_key"))
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow::anyhow!("Local State has no os_crypt.encrypted_key"))?;
        let raw = base64::engine::general_purpose::STANDARD.decode(encoded)?;
        let blob = raw
            .strip_prefix(b"DPAPI")
            .ok_or_else(|| anyhow::anyhow!("the cookie key is not wrapped with DPAPI"))?;
        let plain = dpapi_unprotect(blob)?;
        plain
            .try_into()
            .map_err(|_| anyhow::anyhow!("the cookie key is not 32 bytes"))
    }

    fn dpapi_unprotect(blob: &[u8]) -> anyhow::Result<Vec<u8>> {
        use windows_sys::Win32::Foundation::LocalFree;
        use windows_sys::Win32::Security::Cryptography::{
            CryptUnprotectData, CRYPT_INTEGER_BLOB,
        };

        let mut input = CRYPT_INTEGER_BLOB {
            cbData: blob.len() as u32,
            pbData: blob.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = unsafe {
            CryptUnprotectData(
                &mut input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                0,
                &mut output,
            )
        };
        if ok == 0 {
            anyhow::bail!("DPAPI refused to open this machine's cookie key");
        }
        let plain = unsafe {
            std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec()
        };
        unsafe {
            LocalFree(output.pbData as _);
        }
        Ok(plain)
    }

    fn cookie_from_row(row: &sqlx::sqlite::SqliteRow, key: &[u8; 32]) -> anyhow::Result<Value> {
        let host: String = row.try_get("host_key")?;
        let name: String = row.try_get("name")?;
        let stored: String = row.try_get("value").unwrap_or_default();
        let encrypted: Vec<u8> = row.try_get("encrypted_value").unwrap_or_default();
        let value = if encrypted.is_empty() {
            stored
        } else {
            decrypt(key, &host, &encrypted)
                .ok_or_else(|| anyhow::anyhow!("{host} {name} could not be decrypted"))?
        };

        let path: String = row.try_get("path").unwrap_or_else(|_| "/".into());
        let expires_utc: i64 = row.try_get("expires_utc").unwrap_or(0);
        let has_expires: i64 = row.try_get("has_expires").unwrap_or(0);
        let is_secure: i64 = row.try_get("is_secure").unwrap_or(0);
        let is_httponly: i64 = row.try_get("is_httponly").unwrap_or(0);
        let samesite: i64 = row.try_get("samesite").unwrap_or(-1);
        let priority: i64 = row.try_get("priority").unwrap_or(1);
        let source_scheme: i64 = row.try_get("source_scheme").unwrap_or(0);
        let source_port: i64 = row.try_get("source_port").unwrap_or(443);

        let session = has_expires == 0 || expires_utc <= 0;
        let mut cookie = json!({
            "domain": host,
            "expires": if session { -1.0 } else { expires_utc as f64 / 1_000_000.0 - EPOCH_DELTA },
            "httpOnly": is_httponly != 0,
            "name": name,
            "path": path,
            "priority": match priority { 0 => "Low", 2 => "High", _ => "Medium" },
            "secure": is_secure != 0,
            "session": session,
            "size": name.len() + value.len(),
            "sourcePort": source_port,
            // Chromium's CookieSourceScheme: 0 unset, 1 non-secure, 2 secure.
            // Checked against a CDP export of the same jar: 2 is what writes
            // "Secure" and 1 is the one non-secure row.
            "sourceScheme": match source_scheme { 1 => "NonSecure", 2 => "Secure", _ => "Unspecified" },
            "value": value,
        });
        // CDP omits sameSite for a cookie that never declared one (-1); the
        // other three values are the enum Chromium writes.
        if samesite >= 0 {
            cookie["sameSite"] = json!(match samesite {
                0 => "None",
                1 => "Lax",
                _ => "Strict",
            });
        }
        Ok(cookie)
    }

    /// `v10` + 12-byte nonce + ciphertext + tag, AES-256-GCM, and the plaintext
    /// starts with the host's SHA-256 — checked so a wrong key is refused here
    /// rather than written into an export file.
    fn decrypt(key: &[u8; 32], host_key: &str, blob: &[u8]) -> Option<String> {
        if blob.len() < 3 + 12 + 16 || &blob[..3] != b"v10" {
            return None;
        }
        let cipher = Aes256Gcm::new_from_slice(key).ok()?;
        let nonce = Nonce::from_slice(&blob[3..15]);
        let plain = cipher.decrypt(nonce, &blob[15..]).ok()?;
        if plain.len() < HOST_HASH_LEN {
            return None;
        }
        let want = Sha256::digest(host_key.as_bytes());
        if plain[..HOST_HASH_LEN] != want[..] {
            return None;
        }
        String::from_utf8(plain[HOST_HASH_LEN..].to_vec()).ok()
    }

    /// A private copy of the database and its WAL.
    ///
    /// SQLite needs to write when it replays a WAL, so opening the live file
    /// read-only either fails or needs the `-shm` index. A copy costs a few
    /// megabytes and leaves the profile untouched, which is the property that
    /// matters: an export must never be able to damage the jar.
    struct Scratch(PathBuf);

    impl Scratch {
        fn copy(db: &Path) -> anyhow::Result<Self> {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or_default();
            let dir = std::env::temp_dir().join(format!(
                "xchange-cookies-{}-{stamp}",
                std::process::id()
            ));
            std::fs::create_dir_all(&dir)?;
            let copy = dir.join("Cookies");
            std::fs::copy(db, &copy)?;
            let wal_name = format!(
                "{}-wal",
                db.file_name().and_then(|n| n.to_str()).unwrap_or("Cookies")
            );
            let wal = db.with_file_name(wal_name);
            if wal.is_file() {
                std::fs::copy(&wal, dir.join("Cookies-wal"))?;
            }
            Ok(Scratch(copy))
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            if let Some(dir) = self.0.parent() {
                let _ = std::fs::remove_dir_all(dir);
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use aes_gcm::aead::Aead;
        use aes_gcm::KeyInit;

        fn sealed(key: &[u8; 32], host: &str, value: &str) -> Vec<u8> {
            let mut plain = Sha256::digest(host.as_bytes()).to_vec();
            plain.extend_from_slice(value.as_bytes());
            let cipher = Aes256Gcm::new_from_slice(key).unwrap();
            let nonce = [7u8; 12];
            let mut blob = b"v10".to_vec();
            blob.extend_from_slice(&nonce);
            blob.extend_from_slice(&cipher.encrypt(Nonce::from_slice(&nonce), plain.as_slice()).unwrap());
            blob
        }

        #[test]
        fn a_v10_row_opens_under_the_profile_key() {
            let key = [9u8; 32];
            let blob = sealed(&key, ".shopee.vn", "SPC_F=abc");
            assert_eq!(decrypt(&key, ".shopee.vn", &blob).as_deref(), Some("SPC_F=abc"));
        }

        #[test]
        fn the_host_hash_is_what_refuses_the_wrong_key() {
            let key = [9u8; 32];
            let blob = sealed(&key, ".shopee.vn", "secret");
            assert!(decrypt(&[8u8; 32], ".shopee.vn", &blob).is_none());
            // Right key, wrong host: the prefix no longer matches either.
            assert!(decrypt(&key, ".example.com", &blob).is_none());
        }

        #[test]
        fn only_v10_is_attempted() {
            let key = [9u8; 32];
            let mut blob = sealed(&key, ".shopee.vn", "secret");
            blob[..3].copy_from_slice(b"v20");
            assert!(decrypt(&key, ".shopee.vn", &blob).is_none());
        }
    }
}
