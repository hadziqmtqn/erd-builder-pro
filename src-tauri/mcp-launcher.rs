#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::{env, fs, path::{Path, PathBuf}, process::{Command, Stdio}};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn home_dir() -> Result<PathBuf, String> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "User home directory is unavailable".to_string())
}

fn app_data_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    return Ok(home_dir()?.join("Library/Application Support/com.erdbuilderpro.app"));

    #[cfg(target_os = "windows")]
    return Ok(env::var_os("APPDATA").map(PathBuf::from)
        .unwrap_or(home_dir()?.join("AppData/Roaming"))
        .join("com.erdbuilderpro.app"));

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return Ok(env::var_os("XDG_DATA_HOME").map(PathBuf::from)
        .unwrap_or(home_dir()?.join(".local/share"))
        .join("com.erdbuilderpro.app"));
}

#[cfg(not(target_os = "windows"))]
fn executable_node(resource_dir: &Path, bundled: &Path) -> Result<PathBuf, String> {
    use std::os::unix::fs::PermissionsExt;

    let cache_root = if cfg!(target_os = "macos") {
        home_dir()?.join("Library/Caches")
    } else {
        env::var_os("XDG_CACHE_HOME").map(PathBuf::from)
            .unwrap_or(home_dir()?.join(".cache"))
    };
    let cached = cache_root.join("com.erdbuilderpro.app/node-bin/node");
    let should_copy = !cached.exists()
        || fs::metadata(resource_dir.join("dist-server/node-bin/node")).and_then(|m| m.modified()).ok()
            > fs::metadata(&cached).and_then(|m| m.modified()).ok();

    if should_copy {
        fs::create_dir_all(cached.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::copy(bundled, &cached).map_err(|e| e.to_string())?;
        fs::set_permissions(&cached, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }
    Ok(cached)
}

fn run() -> Result<i32, String> {
    let executable = env::current_exe().map_err(|e| e.to_string())?;
    let resource_dir = executable.parent().and_then(Path::parent)
        .ok_or_else(|| "Cannot resolve application resources".to_string())?;
    let mcp_script = resource_dir.join("dist-server/mcp.js");
    if !mcp_script.exists() {
        return Err(format!("MCP server not found: {}", mcp_script.display()));
    }

    #[cfg(target_os = "windows")]
    let node = resource_dir.join("dist-server/node-bin/node.exe");
    #[cfg(not(target_os = "windows"))]
    let node = executable_node(resource_dir, &resource_dir.join("dist-server/node-bin/node"))?;
    if !node.exists() {
        return Err(format!("Bundled Node.js not found: {}", node.display()));
    }

    let data_dir = app_data_dir()?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let mut command = Command::new(node);
    command.arg(mcp_script)
        .env("DATABASE_URL", format!("file:{}", data_dir.join("data.db").display()))
        .env("DB_VARIANT", "sqlite")
        .env("NODE_ENV", "production")
        .env("ERD_INSTALL_MODE", "desktop")
        .env("ERDBPRO_MCP_STDIO", "1")
        .current_dir(data_dir)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let status = command.status().map_err(|e| e.to_string())?;
    Ok(status.code().unwrap_or(1))
}

fn main() {
    match run() {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("ERD Builder Pro MCP: {error}");
            std::process::exit(1);
        }
    }
}
