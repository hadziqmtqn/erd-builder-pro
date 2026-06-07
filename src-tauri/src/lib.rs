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
  let candidates = [
    // Intel + Apple Silicon Homebrew
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    // nvm (default location, but real path varies by user — best effort)
    // System installs
    "/usr/bin/node",
    // macPorts
    "/opt/local/bin/node",
  ];

  for path in &candidates {
    if std::path::Path::new(path).exists() {
      return Some(path.to_string());
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
    "Node.js not found. Please install Node.js (https://nodejs.org) and try again."
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

  // Before starting the server, run `prisma db push` to apply the schema
  // to the freshly-created (empty) SQLite database. Without this the server
  // starts but every query fails with "table does not exist".
  let db_path = app_data_dir.join("data.db");
  let needs_migration = !db_path.exists()
    || std::fs::metadata(&db_path).map(|m| m.len() == 0).unwrap_or(true);

  if needs_migration {
    log::info!(
      "Running Prisma db push to initialize SQLite schema at {}",
      db_path.display()
    );

    // `prisma db push` ships inside `node_modules/prisma/build/index.js` —
    // we invoke it through node with the right env. Same code path as the
    // Prisma CLI, just driven from Rust so we don't need a shell.
    let prisma_cli = bundled_nm.join("prisma/build/index.js");
    let prisma_schema = resource_dir.join("dist-server/prisma/schema.prisma");

    if !prisma_cli.exists() {
      log::warn!(
        "Prisma CLI not found at {:?} — skipping db push (server may fail)",
        prisma_cli
      );
    } else {
      let migration_stdout = open_log();
      let migration_stderr = open_log();

      let output = Command::new(&node_bin)
        .arg(&prisma_cli)
        .arg("db")
        .arg("push")
        .arg("--accept-data-loss")
        .arg("--schema")
        .arg(&prisma_schema)
        // Prisma 7 removed `datasource.url` from schema files. The CLI
        // now requires either a `prisma.config.ts` (with `datasource.url`)
        // or an explicit `--url` flag at invocation. Bundling a config
        // file is heavy (it needs dotenv + path resolution), so we pass
        // the URL directly via the flag — no config file required.
        .arg("--url")
        .arg(format!("file:{}", db_path.display()))
        .env("NODE_PATH", bundled_nm.to_string_lossy().to_string())
        .env("DATABASE_URL", format!("file:{}", db_path.display()))
        .current_dir(&app_data_dir)
        .stdout(migration_stdout)
        .stderr(migration_stderr)
        .output()
        .map_err(|e| format!("Failed to run prisma db push: {}", e))?;

      if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
          "Prisma db push failed (exit {:?}):\nstdout: {}\nstderr: {}",
          output.status.code(),
          stdout,
          stderr
        )
        .into());
      }
      log::info!("Prisma schema applied successfully");
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
