// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

//! Profiles in from a folder or a zip, the other half of `export.rs`.
//!
//! Three shapes are accepted, because those are the three an operator actually
//! has after moving a profile between machines:
//!
//!   - the folder or zip **export** produced (`manifest.json` + one directory
//!     per profile),
//!   - **one profile directory** on its own, copied out of such an export,
//!   - a **parent folder** holding several profile directories.
//!
//! The shape is detected rather than asked for: a chosen path that contains no
//! profile is refused with a message naming what was expected, instead of
//! creating an empty profile from whatever was selected.
//!
//! What travels beside the browser data is as important as the data:
//! `profile.json` keeps the persona and the fingerprint seed, so an imported
//! account comes back as the same machine rather than a new one, and
//! `logins.json` becomes rows in the credentials table under the new profile
//! id. Neither file is left inside the imported browser directory.

use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::store::{Credential, Profile, Store};

/// What one import did, for the notice the interface shows.
#[derive(Debug, Default)]
pub struct Report {
    pub imported: usize,
    pub logins: usize,
    pub names: Vec<String>,
}

/// The metadata `profile.json` carries, and the same fields in the manifest.
///
/// Every field is defaulted: an export made before `profile.json` existed has
/// only the root manifest, and a profile directory copied by hand may have
/// neither. Missing metadata is a profile with a new seed, not a refusal.
#[derive(Clone, Debug, Default, Deserialize)]
struct ProfileFile {
    #[serde(default)]
    name: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    status: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    persona_id: String,
    #[serde(default)]
    fp_seed: i64,
    #[serde(default)]
    allow_no_proxy: bool,
    #[serde(default)]
    timezone: Option<String>,
    #[serde(default)]
    languages: Option<Vec<String>>,
    #[serde(default)]
    start_urls: Vec<String>,
    #[serde(default)]
    overrides: xchange_shared::overrides::MachineOverrides,
    #[serde(default)]
    blocklists: Vec<String>,
    #[serde(default)]
    logins_file: String,
}

#[derive(Deserialize)]
struct Manifest {
    #[serde(default)]
    kind: String,
    #[serde(default)]
    version: u32,
    #[serde(default)]
    profiles: Vec<ManifestEntry>,
}

#[derive(Deserialize)]
struct ManifestEntry {
    folder: String,
    #[serde(flatten)]
    meta: ProfileFile,
}

struct Found {
    /// The directory name, used for a display name when metadata has none.
    folder: String,
    meta: ProfileFile,
    dir: PathBuf,
}

/// A temporary extraction directory that removes itself, including when an
/// import fails halfway.
struct Scratch(PathBuf);

impl Scratch {
    fn new() -> anyhow::Result<Self> {
        let dir = std::env::temp_dir().join(format!("xchange-import-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&dir)?;
        Ok(Self(dir))
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn coded(code: &'static str, message: impl Into<String>) -> anyhow::Error {
    anyhow::Error::new(crate::ipc::Coded {
        code,
        message: message.into(),
    })
}

pub async fn import(
    store: &Store,
    path: &Path,
    project_id: Option<&str>,
    profile_dir: impl Fn(&str) -> PathBuf,
) -> anyhow::Result<Report> {
    if !path.exists() {
        return Err(coded(
            "err.importBadSource",
            format!("{} does not exist", path.display()),
        ));
    }

    // A zip is unpacked first; everything after this point reads a directory,
    // so folder and zip take exactly the same path through the importer.
    let scratch = if path.is_file() {
        let is_zip = path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("zip"));
        if !is_zip {
            return Err(coded(
                "err.importBadSource",
                "That is not a .zip file. Choose an exported folder or the .zip file.",
            ));
        }
        let scratch = Scratch::new()?;
        let src = path.to_path_buf();
        let dest = scratch.path().to_path_buf();
        tokio::task::spawn_blocking(move || extract_zip(&src, &dest))
            .await
            .map_err(|e| anyhow::anyhow!("the import task stopped: {e}"))??;
        Some(scratch)
    } else if path.is_dir() {
        None
    } else {
        return Err(coded(
            "err.importBadSource",
            "Choose a folder or an exported .zip file.",
        ));
    };

    let root = scratch
        .as_ref()
        .map(|s| s.path().to_path_buf())
        .unwrap_or_else(|| path.to_path_buf());

    let found = tokio::task::spawn_blocking(move || discover(&root))
        .await
        .map_err(|e| anyhow::anyhow!("the import task stopped: {e}"))??;
    if found.is_empty() {
        return Err(coded(
            "err.importNoProfiles",
            "No XChange profile was found here. Choose an exported profiles folder, a single \
             profile folder, or the exported .zip file.",
        ));
    }

    let fallback_persona = default_persona();
    let mut report = Report::default();
    for profile in found {
        import_one(
            store,
            profile,
            project_id,
            &profile_dir,
            &fallback_persona,
            &mut report,
        )
        .await?;
    }
    Ok(report)
}

async fn import_one<F: Fn(&str) -> PathBuf>(
    store: &Store,
    found: Found,
    project_id: Option<&str>,
    profile_dir: &F,
    fallback_persona: &str,
    report: &mut Report,
) -> anyhow::Result<()> {
    let new_id = uuid::Uuid::now_v7().to_string();
    let dest = profile_dir(&new_id);

    let source = found.dir.clone();
    let target = dest.clone();
    tokio::task::spawn_blocking(move || copy_profile(&source, &target))
        .await
        .map_err(|e| anyhow::anyhow!("the import task stopped: {e}"))??;

    let meta = found.meta;
    let name = display_name(&meta, &found.folder);
    let profile = Profile {
        id: new_id.clone(),
        project_id: project_id.map(str::to_string),
        project_name: None,
        name: name.clone(),
        notes: meta.notes.clone(),
        tags: meta.tags.clone(),
        status: meta.status.clone(),
        blocklists: meta.blocklists.clone(),
        inline_lists: Vec::new(),
        persona_id: safe_persona(&meta, fallback_persona),
        // Zero means "none recorded"; `upsert_profile` gives it a real seed.
        fp_seed: meta.fp_seed,
        allow_no_proxy: meta.allow_no_proxy,
        proxy: None,
        proxy_id: None,
        timezone: meta.timezone.clone(),
        languages: meta.languages.clone(),
        overrides: meta.overrides.clone(),
        start_urls: meta.start_urls.clone(),
        last_opened_at: None,
    };

    if let Err(e) = store.upsert_profile(&profile).await {
        let _ = std::fs::remove_dir_all(&dest);
        return Err(e);
    }
    if let Err(e) = store.set_profile_dir(&new_id, &dest).await {
        discard(store, &new_id, &dest).await;
        return Err(e);
    }

    let logins = match read_logins(&found.dir, &meta.logins_file) {
        Ok(logins) => logins,
        Err(e) => {
            discard(store, &new_id, &dest).await;
            return Err(e);
        }
    };
    for login in logins {
        let credential = Credential {
            id: String::new(),
            profile_id: new_id.clone(),
            label: login.label,
            site: login.site,
            username: login.username,
            password: login.password,
            totp: login.totp,
            cookie: login.cookie,
            notes: login.notes,
        };
        // A seed that does not parse takes the whole profile with it: an
        // account with a missing two-factor secret is not a smaller import, it
        // is an account that cannot sign in.
        if let Err(e) = store.upsert_credential(&credential).await {
            discard(store, &new_id, &dest).await;
            return Err(e);
        }
        report.logins += 1;
    }

    report.imported += 1;
    report.names.push(name);
    Ok(())
}

/// Remove a profile whose import failed after it was inserted.
///
/// `purge_profile` refuses a row that is not in the trash, so the soft delete
/// comes first. Credentials go with the row through the foreign key.
async fn discard(store: &Store, id: &str, dest: &Path) {
    let _ = store.delete_profile(id).await;
    let _ = store.purge_profile(id, dest).await;
}

fn display_name(meta: &ProfileFile, folder: &str) -> String {
    let named = meta.name.trim();
    if !named.is_empty() {
        return named.to_string();
    }
    strip_id_suffix(folder)
}

/// `Luu 01 (01a1cb20-…)` becomes `Luu 01`.
fn strip_id_suffix(folder: &str) -> String {
    let trimmed = folder.trim();
    if let Some(open) = trimmed.rfind(" (") {
        let inner = &trimmed[open + 2..];
        if let Some(id) = inner.strip_suffix(')') {
            if looks_like_id(id) {
                let name = trimmed[..open].trim();
                if !name.is_empty() {
                    return name.to_string();
                }
            }
        }
    }
    if trimmed.is_empty() {
        "Imported profile".to_string()
    } else {
        trimmed.to_string()
    }
}

fn looks_like_id(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(i, c)| {
            if matches!(i, 8 | 13 | 18 | 23) {
                c == '-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}

fn safe_persona(meta: &ProfileFile, fallback: &str) -> String {
    let id = meta.persona_id.trim();
    if !id.is_empty() && crate::personas::load(id).is_ok() {
        return id.to_string();
    }
    fallback.to_string()
}

fn default_persona() -> String {
    const FALLBACK: &str = "win11-rtx2060-1920x1080";
    if crate::personas::load(FALLBACK).is_ok() {
        return FALLBACK.to_string();
    }
    crate::personas::catalogue()
        .first()
        .map(|p| p.id.clone())
        .unwrap_or_else(|| FALLBACK.to_string())
}

fn discover(root: &Path) -> anyhow::Result<Vec<Found>> {
    let mut root = root.to_path_buf();

    // A zip unpacks to its own top folder; a person may also have selected the
    // folder that contains that folder. Descend through wrappers that hold no
    // profile and exactly one directory.
    for _ in 0..3 {
        if valid_manifest(&root)?.is_some()
            || looks_like_profile(&root)
            || !profile_children(&root)?.is_empty()
        {
            break;
        }
        let dirs = subdirs(&root)?;
        if dirs.len() == 1 {
            root = dirs[0].clone();
        } else {
            break;
        }
    }

    if let Some(manifest) = valid_manifest(&root)? {
        let mut out = Vec::new();
        for entry in manifest.profiles {
            if !is_safe_component(&entry.folder) {
                return Err(coded(
                    "err.importIncomplete",
                    format!(
                        "the export names a folder that is not a folder: {:?}",
                        entry.folder
                    ),
                ));
            }
            let dir = root.join(&entry.folder);
            if !dir.is_dir() {
                return Err(coded(
                    "err.importIncomplete",
                    format!(
                        "the export is missing the profile folder {:?}",
                        entry.folder
                    ),
                ));
            }
            // The per-profile file is newer and travels with the folder; the
            // manifest entry is what an export made before it has.
            let meta = read_profile_file(&dir).unwrap_or(entry.meta);
            out.push(Found {
                folder: entry.folder,
                meta,
                dir,
            });
        }
        return Ok(out);
    }

    if looks_like_profile(&root) {
        let meta = read_profile_file(&root).unwrap_or_default();
        let folder = root
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Imported profile")
            .to_string();
        return Ok(vec![Found {
            folder,
            meta,
            dir: root,
        }]);
    }

    profile_children(&root)
}

fn valid_manifest(dir: &Path) -> anyhow::Result<Option<Manifest>> {
    let path = dir.join("manifest.json");
    if !path.is_file() {
        return Ok(None);
    }
    let raw = std::fs::read(&path).map_err(|e| {
        coded(
            "err.importBadFile",
            format!("could not read {}: {e}", path.display()),
        )
    })?;
    let manifest: Manifest = match serde_json::from_slice(&raw) {
        Ok(manifest) => manifest,
        // A manifest that is not ours is not an error: a folder may hold one
        // for another tool, and the profile-directory detection below still
        // gets a chance.
        Err(_) => return Ok(None),
    };
    if manifest.kind != "xchange.profiles.export" || manifest.profiles.is_empty() {
        return Ok(None);
    }
    let _ = manifest.version;
    Ok(Some(manifest))
}

fn looks_like_profile(dir: &Path) -> bool {
    dir.join("Default").is_dir()
        || dir.join("Local State").is_file()
        || dir.join("profile.json").is_file()
}

fn profile_children(root: &Path) -> anyhow::Result<Vec<Found>> {
    let mut out = Vec::new();
    for dir in subdirs(root)? {
        if !looks_like_profile(&dir) {
            continue;
        }
        let folder = dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Imported profile")
            .to_string();
        let meta = read_profile_file(&dir).unwrap_or_default();
        out.push(Found { folder, meta, dir });
    }
    Ok(out)
}

fn read_profile_file(dir: &Path) -> Option<ProfileFile> {
    let raw = std::fs::read(dir.join("profile.json")).ok()?;
    serde_json::from_slice(&raw).ok()
}

fn read_logins(dir: &Path, file: &str) -> anyhow::Result<Vec<crate::export::Login>> {
    let name = match file.trim() {
        "" => "logins.json",
        name => name,
    };
    if !is_safe_component(name) {
        return Err(coded(
            "err.importBadLogins",
            format!("{name:?} is not a login file name"),
        ));
    }
    let path = dir.join(name);
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read(&path).map_err(|e| {
        coded(
            "err.importBadLogins",
            format!("could not read {}: {e}", path.display()),
        )
    })?;
    let value: serde_json::Value = serde_json::from_slice(&raw).map_err(|e| {
        coded(
            "err.importBadLogins",
            format!("{} is not valid JSON: {e}", path.display()),
        )
    })?;
    let logins = if value.is_array() {
        value
    } else {
        value.get("logins").cloned().ok_or_else(|| {
            coded(
                "err.importBadLogins",
                format!("{} has no logins list", path.display()),
            )
        })?
    };
    serde_json::from_value(logins).map_err(|e| {
        coded(
            "err.importBadLogins",
            format!("{} does not describe logins: {e}", path.display()),
        )
    })
}

fn is_safe_component(name: &str) -> bool {
    !name.trim().is_empty()
        && matches!(
            Path::new(name).components().collect::<Vec<_>>().as_slice(),
            [std::path::Component::Normal(_)]
        )
}

fn subdirs(root: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(root)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            out.push(entry.path());
        }
    }
    out.sort();
    Ok(out)
}

fn extract_zip(src: &Path, dest: &Path) -> anyhow::Result<()> {
    let file = std::fs::File::open(src).map_err(|e| {
        coded(
            "err.importBadFile",
            format!("could not open {}: {e}", src.display()),
        )
    })?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| {
        coded(
            "err.importBadFile",
            format!("{} is not a readable .zip: {e}", src.display()),
        )
    })?;

    let mut total = 0u64;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| coded("err.importBadFile", format!("could not read the .zip: {e}")))?;
        // `enclosed_name` refuses `..`, absolute paths and drive prefixes, so
        // an entry cannot write outside the scratch directory.
        let name = entry.enclosed_name().ok_or_else(|| {
            coded(
                "err.importUnsafeZip",
                "the .zip contains a path that escapes its folder",
            )
        })?;
        total = total.saturating_add(entry.size());
        if total > 20 * 1024 * 1024 * 1024 {
            return Err(coded(
                "err.importBadFile",
                "the .zip is larger than this importer accepts",
            ));
        }

        let out = dest.join(&name);
        if entry.is_dir() {
            std::fs::create_dir_all(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut file = std::fs::File::create(&out)?;
        std::io::copy(&mut entry, &mut file)?;
    }
    Ok(())
}

fn copy_profile(src: &Path, dest: &Path) -> anyhow::Result<()> {
    if dest.exists() {
        return Err(coded(
            "err.importDestExists",
            format!("{} already exists", dest.display()),
        ));
    }
    if let Err(e) = copy_tree(src, dest, Path::new(""), true) {
        let _ = std::fs::remove_dir_all(dest);
        return Err(e);
    }
    Ok(())
}

fn copy_tree(src: &Path, dest: &Path, rel: &Path, at_root: bool) -> anyhow::Result<()> {
    std::fs::create_dir_all(dest)?;
    let mut children: Vec<std::fs::DirEntry> =
        std::fs::read_dir(src)?.collect::<Result<Vec<_>, _>>()?;
    children.sort_by_key(|e| e.file_name());

    for child in children {
        let name = child.file_name();
        let shown = name.to_string_lossy();
        // The two files that belong to the database rather than the browser.
        if at_root && (shown == "logins.json" || shown == "profile.json") {
            continue;
        }
        let child_rel = rel.join(&name);
        // The same rule the export uses: cache, extension binaries, session
        // restore and history are not account state.
        if !crate::export::keep(&child_rel, at_root) {
            continue;
        }
        let kind = child.file_type()?;
        if kind.is_symlink() {
            continue;
        }
        let to = dest.join(&name);
        if kind.is_dir() {
            copy_tree(&child.path(), &to, &child_rel, false)?;
        } else if kind.is_file() {
            std::fs::copy(child.path(), &to)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{Credential, Profile};
    use crate::tmp::TempDir;
    fn write(path: &Path, body: &[u8]) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, body).unwrap();
    }

    fn raw_profile(root: &Path, name: &str) -> PathBuf {
        let dir = root.join(name);
        write(&dir.join("Default/Network/Cookies"), b"jar");
        write(&dir.join("Local State"), b"state");
        write(&dir.join("Default/Preferences"), b"{}");
        write(&dir.join("Default/Extensions/ext/manifest.json"), b"{}");
        write(&dir.join("Default/History"), b"history");
        write(
            &dir.join("logins.json"),
            br#"{"logins":[{"label":"Shopee","site":"shopee.vn","username":"u","password":"p","totp":null,"cookie":null,"notes":""}]}"#,
        );
        dir
    }

    async fn store(tag: &str) -> (TempDir, Store) {
        let root = TempDir::new(tag);
        let store = Store::open_for_tests(&root.join("xchange.db")).await.unwrap();
        (root, store)
    }

    fn dest(root: &Path) -> PathBuf {
        root.join("imported")
    }

    #[tokio::test]
    async fn a_single_profile_folder_is_recognised() {
        let (root, store) = store("import-one").await;
        let source = raw_profile(&root, "Luu 01 (01a1cb20-336c-7d40-87fb-34702083be62)");
        let target = dest(&root);

        let report = import(&store, &source, None, |id| target.join(id))
            .await
            .unwrap();

        assert_eq!(report.imported, 1);
        assert_eq!(report.logins, 1);
        assert_eq!(report.names, vec!["Luu 01"]);

        let profiles = store.profiles(None).await.unwrap();
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].name, "Luu 01");
        let imported = PathBuf::from(&profiles[0].id);
        let data = target.join(&imported);
        assert!(data.join("Default/Network/Cookies").is_file());
        assert!(!data.join("Default/Extensions").exists());
        assert!(!data.join("Default/History").exists());
        assert!(!data.join("logins.json").exists());
        assert!(!data.join("profile.json").exists());
        assert_eq!(store.profile_dir(&profiles[0].id).await.unwrap(), data);

        let credentials = store.credentials(&profiles[0].id).await.unwrap();
        assert_eq!(credentials.len(), 1);
        assert_eq!(credentials[0].label, "Shopee");
        assert_eq!(credentials[0].password.as_deref(), Some("p"));
    }

    #[tokio::test]
    async fn a_folder_of_profiles_imports_all() {
        let (root, store) = store("import-many").await;
        raw_profile(&root, "one");
        raw_profile(&root, "two");
        let target = dest(&root);

        let report = import(&store, &root, None, |id| target.join(id))
            .await
            .unwrap();
        assert_eq!(report.imported, 2);
        assert_eq!(report.logins, 2);
        assert_eq!(store.profiles(None).await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn an_invalid_folder_is_refused() {
        let (root, store) = store("import-invalid").await;
        let empty = root.join("empty");
        std::fs::create_dir_all(&empty).unwrap();
        let target = dest(&root);

        let err = import(&store, &empty, None, |id| target.join(id))
            .await
            .unwrap_err();
        assert!(
            err.to_string().contains("No XChange profile"),
            "unexpected: {err}"
        );
        assert!(store.profiles(None).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_file_that_is_not_a_zip_is_refused() {
        let (root, store) = store("import-txt").await;
        let file = root.join("profiles.txt");
        std::fs::write(&file, b"nothing").unwrap();
        let target = dest(&root);

        let err = import(&store, &file, None, |id| target.join(id))
            .await
            .unwrap_err();
        assert!(err.to_string().contains("not a .zip"), "unexpected: {err}");
    }

    #[tokio::test]
    async fn a_zip_that_climbs_out_is_refused() {
        let (root, store) = store("import-evil").await;
        let file = root.join("evil.zip");
        {
            let mut zip = zip::ZipWriter::new(std::fs::File::create(&file).unwrap());
            zip.start_file("../escaped", zip::write::SimpleFileOptions::default())
                .unwrap();
            std::io::Write::write_all(&mut zip, b"escape").unwrap();
            zip.finish().unwrap();
        }
        let target = dest(&root);

        let err = import(&store, &file, None, |id| target.join(id))
            .await
            .unwrap_err();
        assert!(
            err.to_string().contains("escapes") || err.to_string().contains("path"),
            "unexpected: {err}"
        );
        assert!(!root.parent().unwrap().join("escaped").exists());
    }

    #[tokio::test]
    async fn a_bad_logins_file_leaves_nothing_behind() {
        let (root, store) = store("import-bad-logins").await;
        let source = raw_profile(&root, "broken");
        std::fs::write(source.join("logins.json"), b"not json").unwrap();
        let target = dest(&root);

        let err = import(&store, &source, None, |id| target.join(id))
            .await
            .unwrap_err();
        assert!(err.to_string().contains("JSON"), "unexpected: {err}");
        assert!(store.profiles(None).await.unwrap().is_empty());
        let dirs: Vec<_> = std::fs::read_dir(&target)
            .map(|d| d.flatten().collect())
            .unwrap_or_default();
        assert!(dirs.is_empty(), "a failed import left a directory");
    }

    #[tokio::test]
    async fn an_exported_directory_round_trips_with_its_fingerprint() {
        let (root, source_store) = store("import-export-src").await;
        let profile_id = source_store
            .upsert_profile(&Profile {
                id: String::new(),
                project_id: None,
                project_name: None,
                name: "Luu 01".into(),
                notes: String::new(),
                tags: vec!["shopee".into()],
                status: "warming".into(),
                blocklists: Vec::new(),
                inline_lists: Vec::new(),
                persona_id: "win11-rtx2060-1920x1080".into(),
                fp_seed: 42,
                allow_no_proxy: false,
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
        let data = root.join("source-data").join(&profile_id);
        write(&data.join("Default/Network/Cookies"), b"jar");
        write(&data.join("Local State"), b"state");
        source_store
            .set_profile_dir(&profile_id, &data)
            .await
            .unwrap();
        source_store
            .upsert_credential(&Credential {
                id: String::new(),
                profile_id,
                label: "Shopee".into(),
                site: "shopee.vn".into(),
                username: Some("luu01".into()),
                password: Some("hunter2".into()),
                totp: Some("JBSWY3DP".into()),
                cookie: Some("SPC_F=abc".into()),
                notes: String::new(),
            })
            .await
            .unwrap();

        let out = root.join("export-out");
        std::fs::create_dir_all(&out).unwrap();
        let exported = crate::export::export(
            &source_store,
            &[crate::export::Target {
                id: source_store.profiles(None).await.unwrap()[0].id.clone(),
                name: "Luu 01".into(),
                logins: None,
            }],
            &out,
            "exported_profiles_test",
            crate::export::Format::Directory,
        )
        .await
        .unwrap();

        let (_dest_root, target_store) = store("import-export-dst").await;
        let target = dest(&root);
        let report = import(&target_store, &exported.path, None, |id| target.join(id))
            .await
            .unwrap();
        assert_eq!(report.imported, 1);
        assert_eq!(report.logins, 1);

        let profiles = target_store.profiles(None).await.unwrap();
        assert_eq!(profiles.len(), 1);
        let imported = &profiles[0];
        assert_eq!(imported.name, "Luu 01");
        assert_eq!(imported.persona_id, "win11-rtx2060-1920x1080");
        assert_eq!(imported.fp_seed, 42);
        assert_eq!(imported.tags, vec!["shopee"]);

        let dest_dir = target.join(&imported.id);
        assert!(dest_dir.join("Default/Network/Cookies").is_file());
        assert!(!dest_dir.join("logins.json").exists());
        assert!(!dest_dir.join("profile.json").exists());
        let logins = target_store.credentials(&imported.id).await.unwrap();
        assert_eq!(logins.len(), 1);
        assert_eq!(logins[0].password.as_deref(), Some("hunter2"));
        assert!(logins[0].totp.as_deref().unwrap().starts_with("otpauth://"));
    }

    #[tokio::test]
    async fn an_exported_zip_round_trips() {
        let (root, source_store) = store("import-zip-src").await;
        let profile_id = source_store
            .upsert_profile(&Profile {
                id: String::new(),
                project_id: None,
                project_name: None,
                name: "Luu 02".into(),
                notes: String::new(),
                tags: Vec::new(),
                status: String::new(),
                blocklists: Vec::new(),
                inline_lists: Vec::new(),
                persona_id: "win11".into(),
                fp_seed: 7,
                allow_no_proxy: false,
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
        let data = root.join("source-data").join(&profile_id);
        write(&data.join("Default/Network/Cookies"), b"jar");
        source_store
            .set_profile_dir(&profile_id, &data)
            .await
            .unwrap();

        let out = root.join("export-out");
        std::fs::create_dir_all(&out).unwrap();
        let exported = crate::export::export(
            &source_store,
            &[crate::export::Target {
                id: profile_id,
                name: "Luu 02".into(),
                logins: None,
            }],
            &out,
            "exported_profiles_test",
            crate::export::Format::Zip,
        )
        .await
        .unwrap();
        assert!(exported.path.is_file());

        let (_dest_root, target_store) = store("import-zip-dst").await;
        let target = dest(&root);
        let report = import(&target_store, &exported.path, None, |id| target.join(id))
            .await
            .unwrap();
        assert_eq!(report.imported, 1);
        let profiles = target_store.profiles(None).await.unwrap();
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].name, "Luu 02");
        assert_eq!(profiles[0].fp_seed, 7);
        assert!(target
            .join(&profiles[0].id)
            .join("Default/Network/Cookies")
            .is_file());
    }
}
