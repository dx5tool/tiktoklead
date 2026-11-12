// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

//! Where the agent keeps things.
//!
//! One directory holds the local database, the profile data dirs and the IPC
//! socket, so "back up XChange" and "wipe XChange" are each one operation on one path.

use std::path::{Path, PathBuf};

/// Root of everything this machine's agent owns.
///
/// Deliberately not the desktop shell's config directory: the agent runs with
/// the UI closed (docs/01 — it holds locks and serves the automation API), and
/// tying its data to a GUI application's identity would be wrong the first time
/// someone runs the agent headless on a box with no desktop.
pub use xchange_platform::dirs::data_dir;

/// Personas added on this machine, beside the built-in catalogue: a capture of
/// this computer, kept here instead of published. See personas.rs.
pub fn personas_dir() -> PathBuf {
    data_dir().join("personas")
}

pub fn db_path() -> PathBuf {
    data_dir().join("xchange.db")
}

/// Where an installed core lives.
///
/// Separate from the desktop shell's application bundle, and that separation is
/// the point. The shell is 12 MB and the core is 134 MB compressed; they are
/// versioned apart, and putting the core inside the shell's bundle would break
/// the shell's code signature every time the core was replaced — a signed
/// application whose contents changed underneath it is one macOS refuses to
/// launch, with a message about damage rather than about signing.
///
/// So the shell is a signed bundle that stays as it was shipped, and the core
/// is data next to the profiles. `xchange-agent install-core` puts it here.
///
/// The `.bundle` extension is not decoration. Spotlight indexes a top-level
/// `.app` as an application, so an installed core showed up in search as a
/// second thing called XChange, beside the one the user actually opens. It does
/// NOT index inside a package, which is why real Chrome shows one result and
/// not six despite carrying five helper applications.
///
/// Measured rather than assumed, because the obvious fix does not work: a
/// `.metadata_never_index` file is the documented way to ask, and on macOS 26
/// two identical bundles — one with the marker, one without — were both
/// indexed. A package extension was tried the same way and hid its contents.
pub fn core_dir() -> PathBuf {
    data_dir().join("core.bundle")
}

/// Which release the installed core came from, written by install_core.
///
/// Beside core.bundle rather than in it: an install replaces that directory
/// whole, and the record must describe whatever is there after it.
pub fn core_release_file() -> PathBuf {
    data_dir().join("core.release")
}

/// Where a core installed by an earlier version sits.
///
/// Renamed rather than left: two copies of a 544 MB browser is not a tidy way
/// to change a directory name, and a core the agent no longer looks at is a
/// browser that silently stops being used.
pub fn legacy_core_dir() -> PathBuf {
    data_dir().join("core")
}

/// Where each profile's copy of the core, named after the profile, is made
/// for the macOS Dock (dock.rs).
///
/// `.noindex`, not `.bundle`: measured 12.10.2026, Spotlight lists
/// core.bundle/Fury.app as an application despite what core_dir says, and
/// lists nothing under a `.noindex` directory (core/src/out/*.noindex holds
/// several Fury.app and none appears). A clone per profile in search would be
/// a list of fake applications named after accounts.
pub fn dock_dir() -> PathBuf {
    data_dir().join("dock.noindex")
}

/// Where a profile created under `root` keeps its browser data.
///
/// `root` is `None` when nobody has chosen one, and the default is where every
/// profile has lived since the first release. This is only consulted for a
/// profile whose row carries no path yet; once a profile has run, the path
/// recorded on its row is the truth and changing the root cannot move it. See
/// `Store::profile_dir`.
pub fn profile_dir_in(root: Option<&Path>, profile_id: &str) -> PathBuf {
    match root {
        Some(root) => root.join(profile_id),
        None => profile_dir(profile_id),
    }
}

/// Where a profile's browser data lives between runs.
///
/// The default location, and no longer the whole answer: a profile can be filed
/// elsewhere by `profile_dir_in`. Nothing should call this to find an existing
/// profile — `Store::profile_dir` reads the row. It remains for the one case
/// where there is no row to read yet, and for the message that tells somebody
/// where profiles usually are.
pub fn profile_dir(profile_id: &str) -> PathBuf {
    data_dir().join("profiles").join(profile_id)
}

/// Refuses a profile directory that is not safe to delete or write into.
///
/// The guard exists because the path now travels through the database: it is
/// written by a launch, read back by a purge, and a row is editable by hand. The
/// failure it prevents is not subtle — `remove_dir_all("C:\\")` on a mistyped
/// column deletes the machine, and the operator would have asked for "delete
/// this profile".
///
/// Four things are checked, and each of them rejects a real mistake rather than
/// a hypothetical one:
///
/// - the path is a child of a root this installation knows, so a row pointing at
///   `D:\Somewhere` cannot be emptied because a setting was cleared;
/// - it is not the root itself, or `remove_dir_all` would take every profile;
/// - its final component is the profile id, so a row and the profile it describes
///   cannot disagree about which directory is about to go;
/// - it carries no `..`, which is how a path that passes the first three checks
///   still escapes them once the filesystem resolves it.
pub fn checked_profile_path(roots: &[PathBuf], profile_id: &str, dir: &Path) -> anyhow::Result<()> {
    if profile_id.is_empty() || !profile_id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_') {
        anyhow::bail!("not a profile id: {profile_id:?}");
    }
    if dir.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        anyhow::bail!("refusing {}: it contains \"..\"", dir.display());
    }
    if dir.file_name().and_then(|n| n.to_str()) != Some(profile_id) {
        anyhow::bail!(
            "refusing {}: it does not end with the profile id {profile_id:?}",
            dir.display()
        );
    }
    // A root on its own is the directory every profile lives in — deleting it
    // is not deleting a profile.
    let inside = roots
        .iter()
        .any(|root| dir.parent() == Some(root.as_path()) || dir.starts_with(root) && dir != root.as_path());
    if !inside {
        anyhow::bail!(
            "refusing {}: it is not inside a profile root this machine knows",
            dir.display()
        );
    }
    Ok(())
}

/// Where named blocklists are kept.
///
/// Files rather than database rows. A published list is a hundred thousand
/// domains; copying that into every profile that uses it would be the same
/// megabytes stored fifty times, and the profile row would stop being something
/// a person can read.
pub fn blocklists_dir() -> PathBuf {
    data_dir().join("blocklists")
}

/// Saved profile templates (docs/16 5.6): one JSON file, a few kilobytes. A
/// template is a named set of answers to the batch dialog — proxy, tags,
/// stage, sites, languages — not a profile, and not a table.
pub fn templates_file() -> PathBuf {
    data_dir().join("templates.json")
}

/// Farming plans and where each profile is in them (farm.rs): one JSON file,
/// rewritten when it changes.
pub fn farms_file() -> PathBuf {
    data_dir().join("farms.json")
}

/// Bookmark sets and the profiles each is given to (bookmarks.rs): one JSON
/// file, rewritten when a set is saved or deleted.
pub fn bookmarks_file() -> PathBuf {
    data_dir().join("bookmarks.json")
}

/// Where this profile's unpacked extensions sit.
///
/// INSIDE the profile directory, which means the team bundle carries them
/// without anything extra being written — and it means every profile has its
/// own copy at its own path. That would normally give the same extension a
/// different id in every profile; `ext::install` writes the developer key into
/// the manifest so it does not. See `agent/src/ext.rs`.
///
/// The space in the name is deliberate: Chromium's own directories under a
/// profile are `Local Extension Settings`, `Extension Rules`, `Extension
/// State`. A bare `Extensions` would collide with the one Chromium creates for
/// packed extensions it manages itself.
pub fn extensions_dir(profile_id: &str) -> PathBuf {
    profile_dir(profile_id).join(EXTENSIONS_DIR)
}

/// The name of [`extensions_dir`] inside a profile directory.
pub const EXTENSIONS_DIR: &str = "XChange Extensions";

/// Where the desktop shell reaches this agent.
///
/// A Unix socket on macOS, a named pipe on Windows. Both this and the shell
/// call the same function in `xchange_platform::dirs`, which is the point — the
/// two find each other by computing the same address from the same inputs, and
/// there is no discovery step to fall back on if they disagree.
pub use xchange_platform::dirs::ipc_endpoint;

/// Creates the data directory if needed, readable only by this user.
///
/// The directory holds cookie jars for live accounts. World-readable would be a
/// gift to anything else running on the machine.
pub fn ensure_data_dir() -> std::io::Result<PathBuf> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir)?;
    xchange_platform::perms::owner_only_dir(&dir)?;
    Ok(dir)
}

/// Where the agent writes its log, once [`crate::logging`] has made it.
///
/// Inside the data directory rather than beside the application: the agent is
/// a separate process that outlives the window, and its log belongs with the
/// profiles it is holding, in a directory that is already owner-only.
pub fn log_file() -> PathBuf {
    data_dir().join("logs").join("agent.log")
}

#[cfg(test)]
mod tests {
    use super::*;

    // The address itself is tested in xchange_platform::dirs, which is now the
    // only place that computes it.

    #[test]
    fn the_core_lives_in_a_package_so_search_shows_one_xchange() {
        // The whole reason for the extension. Losing it silently would put a
        // second "XChange" in everybody's Spotlight and nobody would connect the
        // two.
        assert_eq!(
            core_dir().extension().and_then(|e| e.to_str()),
            Some("bundle"),
            "core_dir must keep a package extension — see the note on it"
        );
    }

    #[test]
    fn an_installed_core_is_under_the_same_root() {
        // "Wipe XChange" has to remove the browser as well, or 134 MB survives an
        // uninstall in a directory nobody would think to look in.
        assert!(core_dir().starts_with(data_dir()));
    }

    #[test]
    fn the_data_a_backup_needs_lives_under_one_root() {
        let root = data_dir();
        assert!(db_path().starts_with(&root));
        assert!(profile_dir("abc").starts_with(&root));
        // The socket is explicitly not here: it is a runtime object, and
        // copying one into a backup would be meaningless.
    }

    #[test]
    fn a_chosen_root_only_applies_to_profiles_that_have_none() {
        // The property the whole feature rests on: changing the root must not
        // move a profile that is already on disk, so the recorded path wins and
        // the root is consulted only when there is no path to consult.
        let chosen = Path::new("/Volumes/Big/XChangeProfiles");
        assert_eq!(
            profile_dir_in(Some(chosen), "abc"),
            chosen.join("abc")
        );
        // No root chosen: the historical default, so FURY_HOME keeps working.
        assert_eq!(profile_dir_in(None, "abc"), profile_dir("abc"));
    }

    #[test]
    fn a_doomed_path_that_is_not_a_profile_is_refused() {
        // The guard in front of remove_dir_all. Each case is a real mistake: a
        // column holding a drive root, a row from another installation, a path
        // that walks out of its root.
        let root = PathBuf::from("/tmp/roots");
        let roots = vec![root.clone()];

        // The root itself is every profile, not one.
        assert!(checked_profile_path(&roots, "abc", &root).is_err());
        // Ends with the wrong thing.
        assert!(checked_profile_path(&roots, "abc", &root.join("other")).is_err());
        // Escapes the root by name.
        assert!(checked_profile_path(&roots, "abc", Path::new("/tmp/escaped/abc")).is_err());
        // Escapes it by traversal.
        assert!(checked_profile_path(&roots, "abc", &root.join("../abc")).is_err());
        // A bare drive root, the case that would delete a Windows machine.
        assert!(checked_profile_path(&roots, "abc", Path::new("C:\\")).is_err());

        // And the legitimate one passes.
        assert!(checked_profile_path(&roots, "abc", &root.join("abc")).is_ok());
    }
}
