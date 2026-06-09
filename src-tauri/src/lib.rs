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
fn start_backend_server(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
  let resource_dir = app.path().resource_dir()?;
  let app_data_dir = app.path().app_data_dir()?;

  std::fs::create_dir_all(&app_data_dir)?;

  // Set NODE_PATH so external requires (Prisma, better-sqlite3, etc.) resolve
  // to the bundled node_modules inside dist-server/
  let bundled_nm = resource_dir.join("dist-server/node_modules");

  let server_script = resource_dir.join("dist-server/index.js");
  if !server_script.exists() {
    return Err(format!(
      "Server script not found at: {}",
      server_script.display()
    )
    .into());
  }

  // Locate the Node.js binary — must work even when launched from Finder/Dock
  // where PATH is empty.
  let node_bin = find_node_executable().ok_or_else(|| {
    "Node.js not found. The app probes: Homebrew (/opt/homebrew/bin, /usr/local/bin), \
     nvm (~/.nvm/versions/node/*/bin), fnm (~/.fnm/current/bin), \
     Volta (~/.volta/bin), MacPorts (/opt/local/bin), and PATH. \
     If you use a different version manager, install Node.js from https://nodejs.org \
     or create a symlink at one of these locations."
  })?;

  log::info!(
    "Starting backend server: node={} script={} (data dir: {})",
    node_bin,
    server_script.display(),
    app_data_dir.display()
  );

  // Pipe stdout/stderr to a log file so we can debug spawn issues from
  // macOS Console.app. Without this, any server error is invisible.
  // Each child process needs its own file handle, so we open the log file
  // separately for the migration step and the server.
  let open_log = || -> std::process::Stdio {
    app.path()
      .app_log_dir()
      .ok()
      .and_then(|d| {
        let _ = std::fs::create_dir_all(&d);
        std::fs::OpenOptions::new()
          .create(true)
          .append(true)
          .open(d.join("server.log"))
          .ok()
      })
      .map(std::process::Stdio::from)
      .unwrap_or_else(|| std::process::Stdio::null())
  };

  // Before starting the server, apply the SQLite schema using the lightweight
  // offline migration script. This replaces `prisma db push` (which would
  // require bundling the 41MB prisma CLI), using a pre-generated schema.sql
  // that is applied via better-sqlite3 directly.
  let db_path = app_data_dir.join("data.db");
  let needs_migration = !db_path.exists()
    || std::fs::metadata(&db_path).map(|m| m.len() == 0).unwrap_or(true);

  if needs_migration {
    log::info!(
      "Running offline migration to initialize SQLite schema at {}",
      db_path.display()
    );

    let migrate_script = resource_dir.join("dist-server/migrate-db.mjs");

    if !migrate_script.exists() {
      log::warn!(
        "Migration script not found at {:?} — skipping db init (server may fail)",
        migrate_script
      );
    } else {
      let migration_stdout = open_log();

      let output = Command::new(&node_bin)
        .arg(&migrate_script)
        .arg(db_path.to_string_lossy().to_string())
        .env("NODE_PATH", bundled_nm.to_string_lossy().to_string())
        .current_dir(&app_data_dir)
        .stdout(migration_stdout)
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run migration script: {}", e))?;

      if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!(
          "Database migration failed (exit {:?}) — attempting to start server anyway: {}",
          output.status.code(),
          stderr
        );
      } else {
        log::info!("Database schema applied successfully via offline migration");
      }
    }
  }

  let server_stdout = open_log();
  let server_stderr = open_log();

  let child = Command::new(&node_bin)
    .arg(&server_script)
    .env("NODE_ENV", "production")
    .env("PORT", "3099")
    .env("NODE_PATH", bundled_nm.to_string_lossy().to_string())
    .env(
      "DATABASE_URL",
      format!("file:{}", app_data_dir.join("data.db").display()),
    )
    .current_dir(&app_data_dir)
    .stdout(server_stdout)
    .stderr(server_stderr)
    .spawn()
    .map_err(|e| format!("Failed to spawn '{}': {}", node_bin, e))?;

  app.manage(ServerProcess(Mutex::new(Some(child))));

  log::info!("Backend server started on port 3099");
  Ok(())
}
