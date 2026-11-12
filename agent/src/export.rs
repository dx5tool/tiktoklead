// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

//! A profile out to a folder or a zip, for moving it to another machine.
//!
//! This is deliberately not the sealed bundle `bundle.rs` makes: that one is
//! for a server and a colleague's agent, and it is useless without the key that
//! sealed it. An export is the operator's own copy — a directory of browser
//! data and a `manifest.json` they can open, inspect and carry on a USB stick.
//!
//! Two consequences decide the shape:
//!
//!   - **It is plain text.** Each profile folder carries a `logins.json` with
//!     that profile's saved logins — passwords, two-factor seeds and session
//!     cookies — because the point of the export is to restore those on the
//!     next machine. That file has to be guarded like a password.
//!   - **It is portable and small.** Cache directories and Chromium's lock
//!     files are left out with the same lists `bundle::pack` uses; extension
//!     binaries, session restore, history and the browser's own password and
//!     autofill stores are left out on top of that. They are not account
//!     state, they are the same megabytes in every profile, and they are what
//!     turned a few-megabyte export into a copy of the whole browser.
//!
//! Nothing here writes to the source profile and nothing launches a browser.

use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::store::{Credential, Profile, Store};

pub enum Format {
    Directory,
    Zip,
}

#[derive(Deserialize)]
pub struct Target {
    pub id: String,
    pub name: String,
    /// Present for a team profile, whose logins live on the server and were
    /// opened by the shell with the organisation key. `None` for a local
    /// profile: those logins are read here, from the only vault that has them.
    #[serde(default)]
    pub logins: Option<Vec<Login>>,
}

/// One saved login, in the shape `credentials.upsert` accepts on the way back.
///
/// `id` and `profile_id` are deliberately absent: an import creates new rows
/// under a new profile id, so carrying the old identifiers would only invite a
/// caller to trust them.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Login {
    pub label: String,
    #[serde(default)]
    pub site: String,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    /// An `otpauth://` URI — the normalised form the store writes.
    #[serde(default)]
    pub totp: Option<String>,
    /// A Cookie header for the session (`SPC_F=…; SPC_EC=…`), not the jar.
    #[serde(default)]
    pub cookie: Option<String>,
    #[serde(default)]
    pub notes: String,
}

impl From<Credential> for Login {
    fn from(c: Credential) -> Self {
        Self {
            label: c.label,
            site: c.site,
            username: c.username,
            password: c.password,
            totp: c.totp,
            cookie: c.cookie,
            notes: c.notes,
        }
    }
}

pub struct Report {
    pub path: PathBuf,
    pub profiles: usize,
    pub skipped: usize,
    pub bytes: u64,
}

struct Entry {
    folder: String,
    src: PathBuf,
    manifest: serde_json::Value,
    /// The same metadata, written inside the profile folder as `profile.json`.
    /// A folder copied out of the export on its own still knows its name,
    /// persona and fingerprint seed.
    profile: Vec<u8>,
    /// The login file written inside this profile's folder. Kept apart from
    /// the root manifest: an account's secrets belong with the account, and a
    /// folder copied on its own must still carry them.
    logins: Vec<u8>,
}

struct Written {
    path: PathBuf,
    bytes: u64,
}

pub async fn export(
    store: &Store,
    targets: &[Target],
    dir: &Path,
    name: &str,
    format: Format,
) -> anyhow::Result<Report> {
    checked_component(name)?;

    let mut used = HashSet::new();
    let mut entries = Vec::new();
    let mut skipped = 0usize;

    for target in targets {
        // The row, not `paths::profile_dir`: a profile may be filed under a
        // root the operator chose, and only the row knows where.
        let src = store.profile_dir(&target.id).await?;
        if !src.is_dir() {
            // A team profile that has never been opened has no data here. It is
            // an ordinary state, not a failure, and the report counts it.
            skipped += 1;
            continue;
        }

        let row = store.profile(&target.id).await?;
        let name = row
            .as_ref()
            .map(|p| p.name.as_str())
            .filter(|n| !n.trim().is_empty())
            .unwrap_or(target.name.as_str());
        // The id travels in the folder name: two profiles may share a name,
        // and an import has to know which folder is which without opening a
        // file to find out.
        let folder = unique_folder(&folder_for(name, &target.id), &mut used);
        let logins = match &target.logins {
            Some(logins) => logins.clone(),
            None => store
                .credentials_checked(&target.id)
                .await?
                .into_iter()
                .map(Login::from)
                .collect(),
        };
        let logins = serde_json::to_vec_pretty(&serde_json::json!({
            "kind": "xchange.profile.logins",
            "version": 1,
            "profile_id": target.id,
            "logins": logins,
        }))?;
        let manifest = entry_for(row.as_ref(), &target.id, &target.name, &folder);
        let profile = serde_json::to_vec_pretty(&manifest)?;
        entries.push(Entry {
            folder,
            src,
            manifest,
            profile,
            logins,
        });
    }

    if entries.is_empty() {
        anyhow::bail!("no selected profile has browser data on this machine");
    }

    let manifest = serde_json::json!({
        "kind": "xchange.profiles.export",
        "version": 1,
        "exported_at": time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default(),
        "agent_version": env!("CARGO_PKG_VERSION"),
        "profiles": entries.iter().map(|e| e.manifest.clone()).collect::<Vec<_>>(),
    });
    let manifest = serde_json::to_vec_pretty(&manifest)?;

    let profiles = entries.len();
    let dir = dir.to_path_buf();
    let name = name.to_string();
    // A profile can be gigabytes. Holding the agent's runtime while it is read
    // and written would stall every other call behind a disk.
    let written = tokio::task::spawn_blocking(move || match format {
        Format::Directory => write_directory(&dir, &name, &entries, &manifest),
        Format::Zip => write_zip(&dir, &name, &entries, &manifest),
    })
    .await
    .map_err(|e| anyhow::anyhow!("the export task stopped: {e}"))??;

    Ok(Report {
        path: written.path,
        profiles,
        skipped,
        bytes: written.bytes,
    })
}

/// `name` is the only part of the path a caller controls, so it has to be a
/// name: exactly one normal component, no separator and no `..`.
fn checked_component(name: &str) -> anyhow::Result<()> {
    if !matches!(
        Path::new(name).components().collect::<Vec<_>>().as_slice(),
        [std::path::Component::Normal(_)]
    ) {
        anyhow::bail!("\"{name}\" is not a folder name");
    }
    Ok(())
}

/// The profile's manifest entry.
///
/// Built field by field on purpose. `store.profile()` returns the proxy with
/// its password already opened, so `serde_json::to_value(&profile)` would put a
/// proxy password into a plain file that exists to be carried around.
fn entry_for(
    row: Option<&Profile>,
    id: &str,
    fallback_name: &str,
    folder: &str,
) -> serde_json::Value {
    let name = row
        .map(|p| p.name.as_str())
        .filter(|n| !n.trim().is_empty())
        .unwrap_or(fallback_name);

    let mut entry = serde_json::json!({
        "folder": folder,
        "id": id,
        "name": name,
        // A pointer only. The secrets themselves live in the profile folder,
        // so a folder taken on its own still carries its accounts.
        "logins_file": "logins.json",
    });

    if let Some(p) = row {
        entry["project_id"] = serde_json::json!(p.project_id);
        entry["project"] = serde_json::json!(p.project_name);
        entry["tags"] = serde_json::json!(p.tags);
        entry["status"] = serde_json::json!(p.status);
        entry["notes"] = serde_json::json!(p.notes);
        entry["persona_id"] = serde_json::json!(p.persona_id);
        entry["fp_seed"] = serde_json::json!(p.fp_seed);
        entry["allow_no_proxy"] = serde_json::json!(p.allow_no_proxy);
        entry["timezone"] = serde_json::json!(p.timezone);
        entry["languages"] = serde_json::json!(p.languages);
        entry["start_urls"] = serde_json::json!(p.start_urls);
        entry["overrides"] = serde_json::json!(p.overrides);
        entry["blocklists"] = serde_json::json!(p.blocklists);
        // Only what names the exit. The password and the rotation URL — which
        // usually embeds an API key — never travel in a plain export.
        entry["proxy"] = match &p.proxy {
            Some(x) => serde_json::json!({
                "name": x.name,
                "kind": x.kind,
                "host": x.host,
                "port": x.port,
            }),
            None => serde_json::Value::Null,
        };
    }

    entry
}

/// Is this directory entry part of the profile rather than one machine's
/// scratch space? The cache lists are `bundle.rs`'s, asked rather than copied,
/// so a new cache entry cannot be added in one place and forgotten in the
/// other. The export-only exclusions below go further than a team bundle on
/// purpose.
pub(crate) fn keep(rel: &Path, at_root: bool) -> bool {
    let name = rel.file_name().and_then(|n| n.to_str()).unwrap_or("");
    !crate::bundle::is_cache_dir(name)
        && !crate::bundle::is_skipped_file(name)
        && !(at_root && crate::bundle::is_skipped_component(name))
        && !is_export_skip(rel)
}

/// What a portable export leaves out that a team bundle keeps.
///
/// Measured on this machine, 11.11.2026: `Default/Extensions` is 33.7 MB in
/// every profile (the IDM module alone), and `Default/Sessions` up to 2.7 MB.
/// Both describe a browser rather than an account. Extension binaries can be
/// installed again; session restore, history and the browser's own password
/// and autofill stores are not what a login is. With them an export is tens of
/// megabytes; without them it is the few megabytes the reference tools carry.
fn is_export_skip(rel: &Path) -> bool {
    let path = rel.to_string_lossy().replace('\\', "/");
    matches!(
        path.as_str(),
        "XChange Extensions"
            | "Default/Extensions"
            | "Default/Sessions"
            | "Default/History"
            | "Default/History-journal"
            | "Default/Favicons"
            | "Default/Favicons-journal"
            | "Default/Top Sites"
            | "Default/Visited Links"
            | "Default/Media History"
            | "Default/Media History-journal"
            | "Default/Login Data"
            | "Default/Login Data-journal"
            | "Default/Login Data For Account"
            | "Default/Login Data For Account-journal"
            | "Default/Web Data"
            | "Default/Web Data-journal"
            | "Default/Network Action Predictor"
    )
}

fn folder_name(raw: &str) -> String {
    let mut safe = String::with_capacity(raw.len());
    for c in raw.chars() {
        if matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || (c as u32) < 0x20 {
            safe.push('-');
        } else {
            safe.push(c);
        }
    }
    // Windows silently drops a trailing dot and a trailing space, which would
    // make two different profile names land in the same directory.
    let safe = safe.trim().trim_end_matches('.').trim();
    if safe.is_empty() {
        "profile".to_string()
    } else {
        safe.to_string()
    }
}

/// `Luu 01 (01a1cb20-336c-7d40-87fb-34702083be62)`.
///
/// The id is not decoration: it is how an import tells two profiles with the
/// same name apart without trusting a file inside a folder it has not read.
fn folder_for(raw: &str, id: &str) -> String {
    folder_name(&format!("{} ({id})", folder_name(raw)))
}

fn unique_folder(raw: &str, used: &mut HashSet<String>) -> String {
    let base = folder_name(raw);
    let mut candidate = base.clone();
    let mut n = 2u32;
    while !used.insert(candidate.to_lowercase()) {
        candidate = format!("{base} ({n})");
        n += 1;
    }
    candidate
}

fn suffixed(dir: &Path, name: &str, ext: &str, n: u32) -> PathBuf {
    if n == 1 {
        dir.join(format!("{name}{ext}"))
    } else {
        dir.join(format!("{name} ({n}){ext}"))
    }
}

fn create_output_dir(dir: &Path, name: &str) -> anyhow::Result<PathBuf> {
    for n in 1..=99 {
        let path = suffixed(dir, name, "", n);
        match std::fs::create_dir(&path) {
            Ok(()) => return Ok(path),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        }
    }
    anyhow::bail!("could not find a free folder name for \"{name}\"")
}

fn create_zip(dir: &Path, name: &str) -> anyhow::Result<(PathBuf, std::fs::File)> {
    for n in 1..=99 {
        let path = suffixed(dir, name, ".zip", n);
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(file) => return Ok((path, file)),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        }
    }
    anyhow::bail!("could not find a free file name for \"{name}.zip\"")
}

fn write_directory(
    dir: &Path,
    name: &str,
    entries: &[Entry],
    manifest: &[u8],
) -> anyhow::Result<Written> {
    let root = create_output_dir(dir, name)?;
    let written = (|| -> anyhow::Result<u64> {
        let mut bytes = 0u64;
        for entry in entries {
            let dest = root.join(&entry.folder);
            copy_tree(&entry.src, &dest, Path::new(""), true, &mut bytes)?;
            std::fs::write(dest.join("profile.json"), &entry.profile)?;
            std::fs::write(dest.join("logins.json"), &entry.logins)?;
        }
        std::fs::write(root.join("manifest.json"), manifest)?;
        Ok(bytes)
    })();

    match written {
        Ok(bytes) => Ok(Written { path: root, bytes }),
        Err(e) => {
            // A half-written export that looks complete is worse than none:
            // somebody imports it and wonders which accounts are missing.
            let _ = std::fs::remove_dir_all(&root);
            Err(e)
        }
    }
}

fn copy_tree(
    src: &Path,
    dst: &Path,
    rel: &Path,
    at_root: bool,
    bytes: &mut u64,
) -> anyhow::Result<()> {
    std::fs::create_dir_all(dst)?;
    let mut children: Vec<std::fs::DirEntry> =
        std::fs::read_dir(src)?.collect::<Result<Vec<_>, _>>()?;
    children.sort_by_key(|e| e.file_name());

    for child in children {
        let name = child.file_name();
        let child_rel = rel.join(&name);
        if !keep(&child_rel, at_root) {
            continue;
        }
        let kind = child.file_type()?;
        // A link points somewhere this export has no business following.
        if kind.is_symlink() {
            continue;
        }
        let to = dst.join(&name);
        if kind.is_dir() {
            copy_tree(&child.path(), &to, &child_rel, false, bytes)?;
        } else if kind.is_file() {
            *bytes += std::fs::copy(child.path(), &to)?;
        }
    }
    Ok(())
}

fn write_zip(
    dir: &Path,
    name: &str,
    entries: &[Entry],
    manifest: &[u8],
) -> anyhow::Result<Written> {
    let (path, file) = create_zip(dir, name)?;
    let written = (|| -> anyhow::Result<u64> {
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o644);
        let mut bytes = 0u64;

        zip.start_file(format!("{name}/manifest.json"), options)?;
        zip.write_all(manifest)?;

        for entry in entries {
            let folder = format!("{name}/{}", entry.folder);
            zip_tree(
                &mut zip,
                &entry.src,
                &folder,
                Path::new(""),
                true,
                options,
                &mut bytes,
            )?;
            zip.start_file(format!("{folder}/profile.json"), options)?;
            zip.write_all(&entry.profile)?;
            zip.start_file(format!("{folder}/logins.json"), options)?;
            zip.write_all(&entry.logins)?;
        }
        zip.finish()?;
        Ok(bytes)
    })();

    match written {
        Ok(bytes) => Ok(Written { path, bytes }),
        Err(e) => {
            let _ = std::fs::remove_file(&path);
            Err(e)
        }
    }
}

fn zip_tree<W: Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    src: &Path,
    prefix: &str,
    rel: &Path,
    at_root: bool,
    options: zip::write::SimpleFileOptions,
    bytes: &mut u64,
) -> anyhow::Result<()> {
    // Written even when empty, so an extractor keeps the shape of the tree.
    zip.add_directory(prefix, options)?;

    let mut children: Vec<std::fs::DirEntry> =
        std::fs::read_dir(src)?.collect::<Result<Vec<_>, _>>()?;
    children.sort_by_key(|e| e.file_name());

    for child in children {
        let name = child.file_name();
        let shown = name.to_string_lossy();
        let child_rel = rel.join(&name);
        if !keep(&child_rel, at_root) {
            continue;
        }
        let kind = child.file_type()?;
        if kind.is_symlink() {
            continue;
        }
        let entry_name = format!("{prefix}/{shown}");
        if kind.is_dir() {
            zip_tree(
                zip,
                &child.path(),
                &entry_name,
                &child_rel,
                false,
                options,
                bytes,
            )?;
        } else if kind.is_file() {
            zip.start_file(&entry_name, options)?;
            let mut file = std::fs::File::open(child.path())?;
            *bytes += std::io::copy(&mut file, zip)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{Profile, Proxy};

    fn write(path: &Path, body: &[u8]) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, body).unwrap();
    }

    fn fake_profile(root: &Path) -> PathBuf {
        let p = root.join("source/profile one");
        write(&p.join("Default/Network/Cookies"), b"jar");
        write(&p.join("Local State"), b"state");
        write(&p.join("Default/Preferences"), b"{}");
        write(&p.join("Default/IndexedDB/data"), b"account state");
        write(&p.join("SingletonLock"), b"lock");
        write(&p.join("DevToolsActivePort"), b"1\n2");
        write(&p.join("Default/Cache/data"), b"cache");
        write(&p.join("Default/GPUCache/data"), b"gpu");
        write(&p.join("Default/Extensions/ext/manifest.json"), b"{}");
        write(&p.join("Default/History"), b"history");
        write(&p.join("Default/Web Data"), b"autofill");
        write(&p.join("WasmTtsEngine/1/x"), b"component");
        write(&p.join("XChange Extensions/e/manifest.json"), b"{}");
        std::fs::create_dir_all(p.join("Default/Sessions")).unwrap();
        p
    }

    fn entry(folder: &str, src: PathBuf) -> Entry {
        Entry {
            folder: folder.into(),
            src,
            manifest: serde_json::json!({ "folder": folder }),
            profile: br#"{"kind":"xchange.profile"}"#.to_vec(),
            logins: br#"{"logins":[]}"#.to_vec(),
        }
    }

    #[test]
    fn folder_names_are_safe_and_unique() {
        assert_eq!(folder_name("Luu / 01: *?"), "Luu - 01- --");
        assert_eq!(folder_name("   "), "profile");
        assert_eq!(folder_name("name."), "name");
        assert_eq!(
            folder_for("Luu / 01", "01a1cb20-336c-7d40-87fb-34702083be62"),
            "Luu - 01 (01a1cb20-336c-7d40-87fb-34702083be62)"
        );

        let mut used = HashSet::new();
        assert_eq!(unique_folder("Luu", &mut used), "Luu");
        assert_eq!(unique_folder("luu", &mut used), "luu (2)");
        assert_eq!(unique_folder("Luu", &mut used), "Luu (3)");
    }

    #[test]
    fn the_export_leaves_out_locks_caches_and_browser_bulk() {
        let root = crate::tmp::TempDir::new("export-dir");
        let src = fake_profile(&root);
        let out = root.join("out");
        std::fs::create_dir_all(&out).unwrap();

        let report = write_directory(
            &out,
            "exported_profiles_test",
            &[entry("Luu 01", src)],
            br#"{"kind":"test"}"#,
        )
        .unwrap();

        assert!(report.path.join("Luu 01/Default/Network/Cookies").is_file());
        assert!(report.path.join("Luu 01/Local State").is_file());
        assert!(report.path.join("Luu 01/Default/IndexedDB/data").is_file());
        assert!(report.path.join("Luu 01/profile.json").is_file());
        assert!(report.path.join("Luu 01/logins.json").is_file());
        assert!(report.path.join("manifest.json").is_file());

        assert!(!report.path.join("Luu 01/SingletonLock").exists());
        assert!(!report.path.join("Luu 01/DevToolsActivePort").exists());
        assert!(!report.path.join("Luu 01/Default/Cache").exists());
        assert!(!report.path.join("Luu 01/Default/GPUCache").exists());
        assert!(!report.path.join("Luu 01/Default/Extensions").exists());
        assert!(!report.path.join("Luu 01/Default/Sessions").exists());
        assert!(!report.path.join("Luu 01/Default/History").exists());
        assert!(!report.path.join("Luu 01/Default/Web Data").exists());
        assert!(!report.path.join("Luu 01/XChange Extensions").exists());
        assert!(!report.path.join("Luu 01/WasmTtsEngine").exists());
        assert!(report.bytes > 0);
    }

    #[test]
    fn a_zip_holds_the_same_tree() {
        let root = crate::tmp::TempDir::new("export-zip");
        let src = fake_profile(&root);
        let out = root.join("out");
        std::fs::create_dir_all(&out).unwrap();

        let report = write_zip(
            &out,
            "exported_profiles_test",
            &[entry("Luu 01", src)],
            br#"{"kind":"test"}"#,
        )
        .unwrap();
        assert_eq!(
            report.path.extension().and_then(|e| e.to_str()),
            Some("zip")
        );

        let mut zip = zip::ZipArchive::new(std::fs::File::open(&report.path).unwrap()).unwrap();
        let mut names = Vec::new();
        for i in 0..zip.len() {
            names.push(zip.by_index(i).unwrap().name().to_string());
        }
        let joined = names.join("\n");

        assert!(joined.contains("exported_profiles_test/manifest.json"));
        assert!(joined.contains("exported_profiles_test/Luu 01/Default/Network/Cookies"));
        assert!(joined.contains("exported_profiles_test/Luu 01/Default/IndexedDB/data"));
        assert!(joined.contains("exported_profiles_test/Luu 01/profile.json"));
        assert!(joined.contains("exported_profiles_test/Luu 01/logins.json"));
        assert!(!joined.contains("SingletonLock"));
        assert!(!joined.contains("Default/Cache"));
        assert!(!joined.contains("Default/GPUCache"));
        assert!(!joined.contains("Default/Extensions"));
        assert!(!joined.contains("Default/Sessions"));
        assert!(!joined.contains("Default/History"));
        assert!(!joined.contains("XChange Extensions"));
        assert!(!joined.contains("WasmTtsEngine"));
    }

    #[test]
    fn a_login_carries_the_import_fields_and_not_the_old_id() {
        let login = Login::from(Credential {
            id: "old-id".into(),
            profile_id: "old-profile".into(),
            label: "Shopee".into(),
            site: "shopee.vn".into(),
            username: Some("luu01".into()),
            password: Some("hunter2".into()),
            totp: Some("otpauth://totp/Shopee:luu01?secret=JBSWY3DP".into()),
            cookie: Some("SPC_F=abc; SPC_EC=def".into()),
            notes: "the main account".into(),
        });

        let value = serde_json::to_value(&login).unwrap();
        for key in [
            "label", "site", "username", "password", "totp", "cookie", "notes",
        ] {
            assert!(value.get(key).is_some(), "missing {key}");
        }
        assert!(value.get("id").is_none());
        assert!(value.get("profile_id").is_none());
        assert_eq!(value["password"], "hunter2");
    }

    #[tokio::test]
    async fn a_local_profile_is_exported_with_its_logins() {
        let root = crate::tmp::TempDir::new("export-local");
        let store = Store::open_for_tests(&root.join("xchange.db")).await.unwrap();
        let profile_id = store
            .upsert_profile(&Profile {
                id: String::new(),
                project_id: None,
                project_name: Some("Luu".into()),
                allow_no_proxy: false,
                name: "Luu 01".into(),
                notes: String::new(),
                status: String::new(),
                tags: vec!["shopee".into()],
                blocklists: Vec::new(),
                inline_lists: Vec::new(),
                persona_id: "win11".into(),
                fp_seed: 42,
                proxy: None,
                proxy_id: None,
                timezone: None,
                languages: None,
                overrides: Default::default(),
                start_urls: Vec::new(),
                last_opened_at: None,
            })
            .await
            .unwrap();

        let data = root.join("data").join(&profile_id);
        write(&data.join("Default/Network/Cookies"), b"jar");
        write(&data.join("Local State"), b"state");
        store.set_profile_dir(&profile_id, &data).await.unwrap();

        store
            .upsert_credential(&Credential {
                id: String::new(),
                profile_id: profile_id.clone(),
                label: "Shopee".into(),
                site: "shopee.vn".into(),
                username: Some("luu01".into()),
                password: Some("hunter2".into()),
                totp: Some("JBSWY3DP".into()),
                cookie: Some("SPC_F=abc; SPC_EC=def".into()),
                notes: String::new(),
            })
            .await
            .unwrap();

        let out = root.join("out");
        std::fs::create_dir_all(&out).unwrap();
        let report = export(
            &store,
            &[Target {
                id: profile_id.clone(),
                name: "ignored".into(),
                logins: None,
            }],
            &out,
            "exported_profiles_test",
            Format::Directory,
        )
        .await
        .unwrap();

        assert_eq!(report.profiles, 1);
        assert_eq!(report.skipped, 0);
        let folder = format!("Luu 01 ({profile_id})");
        assert!(report
            .path
            .join(&folder)
            .join("Default/Network/Cookies")
            .is_file());

        let manifest: serde_json::Value =
            serde_json::from_slice(&std::fs::read(report.path.join("manifest.json")).unwrap())
                .unwrap();
        let entry = &manifest["profiles"][0];
        assert_eq!(entry["name"], "Luu 01");
        assert_eq!(entry["folder"], folder);
        assert_eq!(entry["fp_seed"], 42);
        assert_eq!(entry["logins_file"], "logins.json");
        assert!(
            entry.get("logins").is_none(),
            "the root manifest must not carry the accounts"
        );

        // The same metadata travels inside the folder, so a single profile
        // folder can be imported on its own and keep its fingerprint.
        let profile: serde_json::Value = serde_json::from_slice(
            &std::fs::read(report.path.join(&folder).join("profile.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(profile["name"], "Luu 01");
        assert_eq!(profile["fp_seed"], 42);
        assert_eq!(profile["persona_id"], "win11");
        assert_eq!(profile["logins_file"], "logins.json");

        // The login file lives inside the profile folder, under the same
        // profile id, so the folder can be copied on its own.
        let logins: serde_json::Value = serde_json::from_slice(
            &std::fs::read(report.path.join(&folder).join("logins.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(logins["profile_id"], profile_id);
        assert_eq!(logins["logins"][0]["label"], "Shopee");
        assert_eq!(logins["logins"][0]["username"], "luu01");
        assert_eq!(logins["logins"][0]["password"], "hunter2");
        assert_eq!(logins["logins"][0]["cookie"], "SPC_F=abc; SPC_EC=def");
        assert!(logins["logins"][0]["totp"]
            .as_str()
            .unwrap()
            .starts_with("otpauth://"));
    }

    #[test]
    fn an_existing_name_gets_a_suffix() {
        let root = crate::tmp::TempDir::new("export-collide");
        let first = create_output_dir(&root, "exported").unwrap();
        let second = create_output_dir(&root, "exported").unwrap();
        assert_eq!(first.file_name().unwrap(), "exported");
        assert_eq!(second.file_name().unwrap(), "exported (2)");

        let (first_zip, _) = create_zip(&root, "exported").unwrap();
        let (second_zip, _) = create_zip(&root, "exported").unwrap();
        assert_eq!(first_zip.file_name().unwrap(), "exported.zip");
        assert_eq!(second_zip.file_name().unwrap(), "exported (2).zip");
    }

    #[test]
    fn the_manifest_never_carries_a_proxy_password() {
        let profile = Profile {
            id: "p1".into(),
            project_id: None,
            project_name: Some("Luu".into()),
            name: "Luu 01".into(),
            notes: String::new(),
            tags: vec!["shopee".into()],
            status: "warming".into(),
            blocklists: Vec::new(),
            inline_lists: Vec::new(),
            persona_id: "win11".into(),
            fp_seed: 7,
            allow_no_proxy: false,
            proxy: Some(Proxy {
                id: "px".into(),
                name: "SG-01".into(),
                kind: "socks5".into(),
                host: "1.2.3.4".into(),
                port: 1080,
                username: Some("user".into()),
                password: Some("hunter2".into()),
                last_country: None,
                last_ip: None,
                last_timezone: None,
                last_location: None,
                rotate_url: Some("https://provider/rotate?key=secret".into()),
                checker_url: None,
            }),
            proxy_id: None,
            timezone: None,
            languages: None,
            overrides: Default::default(),
            start_urls: Vec::new(),
            last_opened_at: None,
        };

        let entry = entry_for(Some(&profile), "p1", "fallback", "Luu 01");
        let proxy = &entry["proxy"];
        assert_eq!(proxy["host"], "1.2.3.4");
        assert!(proxy.get("password").is_none());
        assert!(proxy.get("rotate_url").is_none());
        assert_eq!(entry["fp_seed"], 7);
        assert_eq!(entry["project"], "Luu");
        assert_eq!(entry["logins_file"], "logins.json");
        assert!(entry.get("logins").is_none());
    }
}
