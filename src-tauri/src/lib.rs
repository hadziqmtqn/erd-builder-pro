use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

/// Holds the Node.js server child process so it can be killed on exit.
struct ServerProcess(Mutex<Option<Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // In release mode, start the bundled Node.js server as a child process.
      // The server handles API requests (Express + Prisma + SQLite).
      // Errors here must NEVER panic — they would crash the GUI on launch.
      if cfg!(not(debug_assertions)) {
        if let Err(e) = start_backend_server(app) {
          log::error!("Backend server failed to start (continuing without it): {}", e);
          // Write a crash-style log so the user can diagnose from macOS Console.
          let log_path = app.path().app_log_dir().ok().map(|d| {
            let _ = std::fs::create_dir_all(&d);
            d
          });
          if let Some(dir) = log_path {
            let _ = std::fs::write(
              dir.join("server-start-error.log"),
              format!("Failed to start backend server:\n{}\n", e),
            );
          }
        }
      }

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  // Run the event loop — on exit, kill the backend server process.
  app.run(|app_handle, event| {
    if let tauri::RunEvent::Exit = event {
      if let Some(state) = app_handle.try_state::<ServerProcess>() {
        if let Ok(mut guard) = state.0.lock() {
          if let Some(ref mut child) = *guard {
            let _ = child.kill();
            let _ = child.wait();
          }
        }
      }
    }
  });
}

/// Find the Node.js executable on the system.
///
/// macOS GUI apps do NOT inherit the user's shell PATH (launchd clears it),
/// so `Command::new("node")` fails with "No such file or directory" even when
/// the user has Node installed. We probe common install locations instead.
fn find_node_executable() -> Option<String> {
  // Static well-known paths
  let static_candidates = [
    // Apple Silicon Homebrew
    "/opt/homebrew/bin/node",
    // Intel Homebrew / official installer
    "/usr/local/bin/node",
    // System install (unusual on macOS)
    "/usr/bin/node",
    // MacPorts
    "/opt/local/bin/node",
  ];

  for path in &static_candidates {
    if std::path::Path::new(path).exists() {
      return Some(path.to_string());
    }
  }

  // Dynamic paths that need the user's home directory
  let home = std::env::var("HOME").ok();

  if let Some(home) = &home {
    // nvm — probe the actual current version link and the latest installed version
    let nvm_current = format!("{}/.nvm/versions/node/current/bin/node", home);
    if std::path::Path::new(&nvm_current).exists() {
      return Some(nvm_current);
    }

    // fnm — uses a symlink at .fnm/current
    let fnm_current = format!("{}/.fnm/current/bin/node", home);
    if std::path::Path::new(&fnm_current).exists() {
      return Some(fnm_current);
    }

    // Volta
    let volta = format!("{}/.volta/bin/node", home);
    if std::path::Path::new(&volta).exists() {
      return Some(volta);
    }

    // nvm — fallback glob for latest installed version (no symlink case)
    let nvm_dir = format!("{}/.nvm/versions/node", home);
    if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
      let mut versions: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().join("bin/node").exists())
        .map(|e| e.path().join("bin/node").to_string_lossy().to_string())
        .collect();
      // Sort descending so the latest version is first
      versions.sort_by(|a, b| b.cmp(a));
      if let Some(latest) = versions.into_iter().next() {
        return Some(latest);
      }
    }
  }

  // Fallback to PATH lookup (works in dev mode where shell PATH is set)
  if let Ok(output) = Command::new("which").arg("node").output() {
    if output.status.success() {
      if let Ok(s) = String::from_utf8(output.stdout) {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
          return Some(trimmed.to_string());
        }
      }
    }
  }

  None
}

/// Start the Node.js Express server bundled in the app resources.
///
/// The server script (`dist-server/index.js`) was compiled by `build-server.js`
/// and bundled via `tauri.conf.json` → `bundle.resources`.  The SQLite database
/// is created in the app's data directory on first run.
///
/// Key startup steps:
///   1. Locate `node` on the user's machine
///   2. Log Node.js version + ABI (NODE_MODULE_VERSION)
///   3. Detect ABI mismatch with bundled `better-sqlite3` native addon
///   4. If mismatch: copy `better-sqlite3` to writable data dir & `npm rebuild`
///   5. Apply offline SQLite migration (`migrate-db.mjs`) if DB is new/empty
///   6. Spawn the Express server as a child process
///
/// All steps log to `server-startup.log` (alongside `server.log`).
fn start_backend_server(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
  let resource_dir = app.path().resource_dir()?;
  let app_data_dir = app.path().app_data_dir()?;
  std::fs::create_dir_all(&app_data_dir)?;
  // Cache dir (without spaces) — used for npm rebuild to avoid node-gyp
  // path-with-spaces bug in Makefile variable expansion.
  let app_cache_dir = app.path().app_cache_dir()
    .unwrap_or_else(|_| app_data_dir.join("cache"));
  std::fs::create_dir_all(&app_cache_dir)?;

  // ── Logging helpers ──────────────────────────────────────────────
  let log_dir = {
    let d = app.path().app_log_dir()?;
    std::fs::create_dir_all(&d)?;
    d
  };

  /// Append a timestamped line to the startup log.
  fn startup_log(log_dir: &std::path::Path, msg: &str) {
    let ts = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f");
    let line = format!("[{}] {}\n", ts, msg);
    let _ = std::fs::OpenOptions::new()
      .create(true)
      .append(true)
      .open(log_dir.join("server-startup.log"))
      .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
    // Also emit to the Tauri log (visible in Console.app in dev mode)
    log::info!("startup: {}", msg);
  }

  startup_log(&log_dir, "=== ERD Builder Pro backend startup ===");

  let bundled_nm = resource_dir.join("dist-server/node_modules");
  let server_script = resource_dir.join("dist-server/index.js");

  startup_log(&log_dir, &format!("Resource dir:       {}", resource_dir.display()));
  startup_log(&log_dir, &format!("App data dir:       {}", app_data_dir.display()));
  startup_log(&log_dir, &format!("App cache dir:      {}", app_cache_dir.display()));
  startup_log(&log_dir, &format!("Bundled node_mod:   {}", bundled_nm.display()));
  startup_log(&log_dir, &format!("Server script:      {}", server_script.display()));

  if !server_script.exists() {
    let msg = format!("Server script not found at: {}", server_script.display());
    startup_log(&log_dir, &format!("FATAL: {}", msg));
    return Err(msg.into());
  }

  // ── Step 1: Find Node.js ─────────────────────────────────────────
  startup_log(&log_dir, "Step 1: Locating Node.js…");
  let node_bin = find_node_executable().ok_or_else(|| {
    startup_log(&log_dir, "FATAL: Node.js not found");
    "Node.js not found. The app probes: Homebrew (/opt/homebrew/bin, /usr/local/bin), \
     nvm (~/.nvm/versions/node/*/bin), fnm (~/.fnm/current/bin), \
     Volta (~/.volta/bin), MacPorts (/opt/local/bin), and PATH. \
     If you use a different version manager, install Node.js from https://nodejs.org \
     or create a symlink at one of these locations."
  })?;
  startup_log(&log_dir, &format!("  Node binary: {}", node_bin));

  // ── Step 2: Inspect Node version + ABI ───────────────────────────
  startup_log(&log_dir, "Step 2: Inspecting Node.js version…");

  let node_version = String::from_utf8_lossy(
    &Command::new(&node_bin)
      .arg("-v")
      .output()
      .map(|o| o.stdout)
      .unwrap_or_default(),
  )
  .trim()
  .to_string();
  startup_log(&log_dir, &format!("  node -v: {}", node_version));

  // Get the user's NODE_MODULE_VERSION
  let user_mod_version = String::from_utf8_lossy(
    &Command::new(&node_bin)
      .arg("-e")
      .arg("console.log(process.versions.modules)")
      .output()
      .map(|o| o.stdout)
      .unwrap_or_default(),
  )
  .trim()
  .to_string();
  startup_log(&log_dir, &format!("  user  MODULE_VERSION: {}", user_mod_version));

  // Get the bundled better-sqlite3's NODE_MODULE_VERSION
  let bundled_bs3_binding = bundled_nm
    .join("better-sqlite3/build/Release/better_sqlite3.node");
  startup_log(&log_dir, &format!("  bundled bs3 path: {}", bundled_bs3_binding.display()));

  // We try to load the .node file via Node.js to read its NODE_MODULE_VERSION.
  // If require() fails (ABI mismatch), we catch the error and log it.
  // The `.node` binary is a native addon — we need Node.js to parse it,
  // since NODE_MODULE_VERSION is stored in a platform-specific header.
  let (bundled_mod_version, bundled_require_ok) = if bundled_bs3_binding.exists() {
    let result = Command::new(&node_bin)
      .arg("-e")
      .arg(&format!(
        "try{{const m=require('{}');console.log(m.versions?.modules||'ok_no_ver')}}catch(e){{console.log('require_failed')}}",
        bundled_bs3_binding.display()
      ))
      .env("NODE_PATH", bundled_nm.to_string_lossy().to_string())
      .output();

    match result {
      Ok(output) => {
        let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let is_err = !output.status.success();
        if is_err || out == "require_failed" {
          startup_log(&log_dir, "  require() FAILED — ABI mismatch detected (can't load bundled native addon)");
          if is_err {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !stderr.trim().is_empty() {
              startup_log(&log_dir, &format!("  require stderr: {}", stderr.lines().next().unwrap_or("")));
            }
          }
          ("require_failed".to_string(), false)
        } else {
          startup_log(&log_dir, &format!("  require() reports MODULE_VERSION: {}", out));
          (out, true)
        }
      }
      Err(e) => {
        startup_log(&log_dir, &format!("  ERROR spawning node to check module: {}", e));
        ("check_error".to_string(), false)
      }
    }
  } else {
    startup_log(&log_dir, "  WARNING: bundled better_sqlite3.node not found");
    ("missing".to_string(), false)
  };
  startup_log(&log_dir, &format!("  bundled MODULE_VERSION: {}", bundled_mod_version));

  // ── Step 3: Rebuild native modules if ABI mismatch ────────────────
  // The bundled better-sqlite3 was compiled on the CI runner (GitHub
  // Actions). If the user's Node.js version differs, the native addon
  // won't load — e.g.  "NODE_MODULE_VERSION 127 vs 141".
  //
  // Fix: copy better-sqlite3 to the writable app data dir and run
  // `npm rebuild` there. The rebuilt addon replaces the bundled one
  // in the NODE_PATH so Node picks it up first.
  // Derive the node parent directory for PATH manipulation (needed later)
  let node_parent = std::path::Path::new(&node_bin)
    .parent()
    .map(|p| p.to_path_buf())
    .unwrap_or_else(|| std::path::PathBuf::from("/usr/local/bin"));

  let mut node_path = bundled_nm.to_string_lossy().to_string();
  // Rebuild needed ONLY when the bundled native addon fails to load.
  // `require()` success is the real ABI compatibility test — it throws
  // `ERR_DLOPEN_FAILED` with "compiled against different Node version"
  // on ABI mismatch. Checking `.versions.modules` is unreliable because
  // better-sqlite3 does NOT expose that property on the binding object.
  let needs_rebuild = bundled_bs3_binding.exists() && !bundled_require_ok;

  if needs_rebuild {
    startup_log(
      &log_dir,
      "Step 3a: ABI MISMATCH — bundled better-sqlite3 failed to load. Rebuilding native modules…",
    );

    let rebuild_dir = app_cache_dir.join("rebuilt-node-modules");
    let rebuild_nm = rebuild_dir.join("node_modules");
    let rebuild_bs3 = rebuild_nm.join("better-sqlite3");

    // Remove any stale previous rebuild
    let _ = std::fs::remove_dir_all(&rebuild_dir);

    // CRITICAL: Modern npm (>= 10) refuses to run `rebuild` without a
    // package.json in the CWD. Create a minimal one for the fallback path.
    let _ = std::fs::write(rebuild_dir.join("package.json"), "{ \"private\": true, \"description\": \"temp\" }\n");

    if let Err(e) = std::fs::create_dir_all(&rebuild_nm) {
      startup_log(&log_dir, &format!("  ERROR creating rebuild dir: {}", e));
    } else {
      // Copy better-sqlite3 from bundle to writable dir
      let src_bs3 = bundled_nm.join("better-sqlite3");
      if src_bs3.exists() {
        startup_log(&log_dir, "  Copying better-sqlite3 to writable dir…");
        if let Err(e) = copy_dir_recursive(&src_bs3, &rebuild_bs3) {
          startup_log(&log_dir, &format!("  ERROR copying better-sqlite3: {}", e));
        } else {
          // Build PATH for child processes (npm, prebuild-install)
          let bin_dir = bundled_nm.join(".bin").to_string_lossy().to_string();
          let extra_path = format!("{}:{}", node_parent.to_string_lossy(), bin_dir);
          let current_path = std::env::var("PATH").unwrap_or_default();
          let rebuild_path = if current_path.is_empty() {
            format!("{}:/usr/bin:/bin", extra_path)
          } else if !current_path.contains(&extra_path) {
            format!("{}:{}", extra_path, current_path)
          } else {
            current_path
          };

          // ── Attempt 1: prebuild-install directly ──────────────
          // Preferred path — doesn't need npm on PATH, no package.json
          // validation. `prebuild-install` is shipped in bundled
          // node_modules (build-server.js copies it + transitive deps).
          let prebuild_entry = bundled_nm.join("prebuild-install/bin.js");
          let mut rebuild_ok = false;

          if prebuild_entry.exists() {
            startup_log(&log_dir, "  Attempt 1: prebuild-install directly…");
            let pbi_result = Command::new(&node_bin)
              .arg(&prebuild_entry)
              .current_dir(&rebuild_bs3)
              .env("NODE_PATH", &node_path)
              .env("PATH", &rebuild_path)
              .env("npm_config_node_execpath", &node_bin)
              .output();

            match pbi_result {
              Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let stderr = String::from_utf8_lossy(&out.stderr);
                startup_log(&log_dir, &format!("  prebuild-install exit: {:?}", out.status.code()));
                if !stdout.trim().is_empty() {
                  startup_log(&log_dir, &format!("  prebuild-install stdout: {}", stdout.trim().lines().last().unwrap_or("")));
                }
                if !stderr.trim().is_empty() {
                  let last_line = stderr.trim().lines().last().unwrap_or("");
                  if !last_line.is_empty() {
                    startup_log(&log_dir, &format!("  prebuild-install stderr: {}", last_line));
                  }
                }
                rebuild_ok = out.status.success();
              }
              Err(e) => {
                startup_log(&log_dir, &format!("  ERROR spawning prebuild-install: {}", e));
              }
            }
          } else {
            startup_log(&log_dir, "  prebuild-install not found in bundled node_modules");
          }

          // ── Attempt 2: npm rebuild (fallback) ─────────────────
          if !rebuild_ok {
            let npm_bin = node_parent.join("npm");
            let npm_cmd = if npm_bin.exists() {
              npm_bin.to_string_lossy().to_string()
            } else {
              "npm".to_string()
            };

            startup_log(&log_dir, &format!("  Attempt 2: npm rebuild (binary: {})…", npm_cmd));

            let mut rebuild_cmd = Command::new(&npm_cmd);
            rebuild_cmd
              .arg("rebuild")
              .arg("better-sqlite3")
              .env("NODE_PATH", rebuild_nm.to_string_lossy().to_string())
              .env("PATH", &rebuild_path)
              .env("npm_config_node_execpath", &node_bin)
              .current_dir(&rebuild_dir);

            let npm_result = rebuild_cmd.output();

            match npm_result {
              Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                startup_log(&log_dir, &format!("  npm rebuild exit: {:?}", output.status.code()));
                if !stdout.trim().is_empty() {
                  startup_log(&log_dir, &format!("  npm rebuild stdout: {}", stdout.trim()));
                }
                if !stderr.trim().is_empty() {
                  startup_log(&log_dir, &format!("  npm rebuild stderr: {}", stderr.trim()));
                }
                rebuild_ok = output.status.success();
              }
              Err(e) => {
                startup_log(&log_dir, &format!("  ERROR running npm rebuild: {}", e));
              }
            }
          }

          // ── Verification ──────────────────────────────────────
          if rebuild_ok {
            // Verify the rebuilt addon loads successfully
            let rebuilt_bs3_path = rebuild_nm.join("better-sqlite3/build/Release/better_sqlite3.node");
            if rebuilt_bs3_path.exists() {
              let rebuilt_check = String::from_utf8_lossy(
                &Command::new(&node_bin)
                  .arg("-e")
                  .arg(&format!(
                    "try{{require('{}');console.log('LOAD_OK')}}catch(e){{console.log('LOAD_FAIL')}}",
                    rebuilt_bs3_path.display()
                  ))
                  .env("NODE_PATH", rebuild_nm.to_string_lossy().to_string())
                  .output()
                  .map(|o| o.stdout)
                  .unwrap_or_default(),
              )
              .trim()
              .to_string();

              startup_log(&log_dir, &format!("  rebuilt load check: {}", rebuilt_check));

              if rebuilt_check == "LOAD_OK" {
                node_path = format!("{}:{}", rebuild_nm.to_string_lossy().to_string(), node_path);
                startup_log(&log_dir, "  SUCCESS: Native module rebuilt for user's Node.js version");
              } else {
                startup_log(&log_dir, "  WARNING: Rebuilt module still fails to load. Server may fail.");
              }
            } else {
              startup_log(&log_dir, "  WARNING: Rebuild claimed success but .node file not found at expected path");
            }
          } else {
            startup_log(&log_dir, "  FAILED: Both prebuild-install and npm rebuild failed.");
            startup_log(&log_dir, "  Server will likely crash with better-sqlite3 load error.");
            startup_log(&log_dir, "  Check ~/Library/Logs/com.erdbuilderpro.app/server.log for details.");
          }
        }
      } else {
        startup_log(&log_dir, "  WARNING: bundled better-sqlite3 dir not found, can't rebuild");
      }
    }
  } else {
    startup_log(&log_dir, &format!("Step 3: ABI OK (bundled={}, user={}), no rebuild needed", bundled_mod_version, user_mod_version));
  }

  // ── Step 4: Pipe setup for server stdout/stderr ──────────────────
  startup_log(&log_dir, "Step 4: Setting up log pipes…");

  let open_log = || -> std::process::Stdio {
    std::fs::OpenOptions::new()
      .create(true)
      .append(true)
      .open(log_dir.join("server.log"))
      .ok()
      .map(std::process::Stdio::from)
      .unwrap_or_else(|| std::process::Stdio::null())
  };

  // ── Step 5: Offline SQLite migration ─────────────────────────────
  startup_log(&log_dir, "Step 5: Checking database…");
  let db_path = app_data_dir.join("data.db");
  let needs_migration = !db_path.exists()
    || std::fs::metadata(&db_path).map(|m| m.len() == 0).unwrap_or(true);

  startup_log(&log_dir, &format!("  DB path:       {}", db_path.display()));
  startup_log(&log_dir, &format!("  DB exists:     {}", db_path.exists()));
  startup_log(&log_dir, &format!("  Needs migration: {}", needs_migration));

  if needs_migration {
    let migrate_script = resource_dir.join("dist-server/migrate-db.mjs");

    if !migrate_script.exists() {
      startup_log(&log_dir, "  WARNING: migrate-db.mjs not found — server may fail to init DB");
    } else {
      startup_log(&log_dir, "  Running offline migration…");

      let migration_stdout = open_log();
      let output = Command::new(&node_bin)
        .arg(&migrate_script)
        .arg(db_path.to_string_lossy().to_string())
        .env("NODE_PATH", &node_path)
        .current_dir(&app_data_dir)
        .stdout(migration_stdout)
        .stderr(std::process::Stdio::piped())
        .output();

      match output {
        Ok(out) => {
          let stderr = String::from_utf8_lossy(&out.stderr);
          if !out.status.success() {
            startup_log(&log_dir, &format!("  MIGRATION FAILED (exit {:?}): {}", out.status.code(), stderr));
          } else {
            startup_log(&log_dir, "  Migration completed successfully");
          }
        }
        Err(e) => {
          startup_log(&log_dir, &format!("  ERROR running migration: {}", e));
        }
      }
    }
  } else {
    startup_log(&log_dir, "  Database already exists — skipping migration");
  }

  // ── Step 6: Spawn Express server ─────────────────────────────────
  startup_log(&log_dir, "Step 6: Starting Express server…");

  let server_stdout = open_log();
  let server_stderr = open_log();

  startup_log(&log_dir, &format!("  NODE_PATH: {}", node_path));
  startup_log(&log_dir, &format!("  PORT: 3099"));

  let child = Command::new(&node_bin)
    .arg(&server_script)
    .env("NODE_ENV", "production")
    .env("PORT", "3099")
    .env("NODE_PATH", &node_path)
    .env(
      "DATABASE_URL",
      format!("file:{}", db_path.display()),
    )
    .current_dir(&app_data_dir)
    .stdout(server_stdout)
    .stderr(server_stderr)
    .spawn()
    .map_err(|e| {
      let msg = format!("Failed to spawn '{}': {}", node_bin, e);
      startup_log(&log_dir, &format!("FATAL: {}", msg));
      msg
    })?;

  app.manage(ServerProcess(Mutex::new(Some(child))));

  startup_log(&log_dir, "SUCCESS: Backend server process spawned on port 3099");
  startup_log(&log_dir, "=== Startup complete ===");
  log::info!("Backend server started on port 3099");
  Ok(())
}

// ── Utility: Recursive directory copy ─────────────────────────────────

fn copy_dir_recursive(
  src: &std::path::Path,
  dst: &std::path::Path,
) -> Result<(), Box<dyn std::error::Error>> {
  std::fs::create_dir_all(dst)?;
  for entry in std::fs::read_dir(src)? {
    let entry = entry?;
    let ty = entry.file_type()?;
    let dst_path = dst.join(entry.file_name());
    if ty.is_dir() {
      copy_dir_recursive(&entry.path(), &dst_path)?;
    } else {
      std::fs::copy(entry.path(), &dst_path)?;
    }
  }
  Ok(())
}
