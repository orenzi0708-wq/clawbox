// ClawBox Tauri Desktop App
// Auto-downloads Node.js to app data dir if not found on system.

use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

struct AppState {
    server_process: Option<Child>,
}

impl Drop for AppState {
    fn drop(&mut self) {
        if let Some(child) = self.server_process.as_mut() {
            let _ = child.kill();
        }
    }
}

fn detect_platform() -> &'static str {
    #[cfg(target_os = "macos")]
    { "macos" }
    #[cfg(target_os = "windows")]
    { "windows" }
    #[cfg(target_os = "linux")]
    { "linux" }
}

fn node_version_string(command: &Path) -> Option<String> {
    Command::new(command)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .ok()
        .and_then(|out| {
            if out.status.success() {
                let ver = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if ver.starts_with('v') { Some(ver) } else { None }
            } else {
                None
            }
        })
}

fn node_download_url() -> &'static str {
    let platform = detect_platform();
    #[cfg(target_arch = "aarch64")]
    {
        match platform {
            "macos" => "https://nodejs.org/dist/v22.16.0/node-v22.16.0-darwin-arm64.tar.gz",
            _ => "https://nodejs.org/dist/v22.16.0/node-v22.16.0-linux-arm64.tar.gz",
        }
    }
    #[cfg(not(target_arch = "aarch64"))]
    {
        match platform {
            "macos" => "https://nodejs.org/dist/v22.16.0/node-v22.16.0-darwin-x64.tar.gz",
            "windows" => "https://nodejs.org/dist/v22.16.0/node-v22.16.0-win-x64.zip",
            _ => "https://nodejs.org/dist/v22.16.0/node-v22.16.0-linux-x64.tar.gz",
        }
    }
}

fn bundled_node_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("node"))
}

fn which_cmd(cmd: &str) -> String {
    Command::new(if detect_platform() == "windows" { "where" } else { "which" })
        .arg(cmd)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .find(|line| !line.trim().is_empty())
                .unwrap_or(cmd)
                .trim()
                .to_string()
        })
        .unwrap_or_else(|| cmd.to_string())
}

fn windows_node_candidate_paths() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    for key in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Some(value) = std::env::var_os(key) {
            let base = PathBuf::from(value);
            if key == "LOCALAPPDATA" {
                candidates.push(base.join("Programs").join("nodejs").join("node.exe"));
                candidates.push(base.join("nodejs").join("node.exe"));
            } else {
                candidates.push(base.join("nodejs").join("node.exe"));
            }
        }
    }
    if let Some(home) = std::env::var_os("USERPROFILE") {
        let home = PathBuf::from(home);
        candidates.push(home.join("scoop").join("apps").join("nodejs-lts").join("current").join("node.exe"));
        candidates.push(home.join("scoop").join("apps").join("nodejs").join("current").join("node.exe"));
    }
    candidates
}

fn find_node_binary_in_dir(root: &Path) -> Option<PathBuf> {
    let direct = if detect_platform() == "windows" {
        root.join("node.exe")
    } else {
        root.join("bin").join("node")
    };
    if direct.exists() {
        return Some(direct);
    }

    let nested = if detect_platform() == "windows" {
        fs::read_dir(root)
            .ok()?
            .flatten()
            .map(|entry| entry.path().join("node.exe"))
            .find(|path| path.exists())
    } else {
        fs::read_dir(root)
            .ok()?
            .flatten()
            .map(|entry| entry.path().join("bin").join("node"))
            .find(|path| path.exists())
    };

    nested
}

fn verify_node_candidate(candidate: &Path) -> Option<(String, String)> {
    let version = node_version_string(candidate)?;
    Some((candidate.to_string_lossy().to_string(), version))
}

/// Find node binary: PATH > well-known install dirs > bundled app data
fn find_node(app: &tauri::AppHandle) -> Option<(String, String)> {
    let path_candidate = PathBuf::from(which_cmd("node"));
    if path_candidate.exists() {
        if let Some((path, version)) = verify_node_candidate(&path_candidate) {
            println!("Found PATH node: {} at {}", version, path);
            return Some((path, version));
        }
    }

    if detect_platform() == "windows" {
        for candidate in windows_node_candidate_paths() {
            if let Some((path, version)) = verify_node_candidate(&candidate) {
                println!("Found Windows node: {} at {}", version, path);
                return Some((path, version));
            }
        }
    }

    if let Some(node_dir) = bundled_node_dir(app) {
        if let Some(node_bin) = find_node_binary_in_dir(&node_dir) {
            if let Some((path, version)) = verify_node_candidate(&node_bin) {
                println!("Found bundled node: {} at {}", version, path);
                return Some((path, version));
            }
        }
    }

    None
}

/// Download and extract node into app data dir
fn download_node(app: &tauri::AppHandle) -> Result<String, String> {
    let url = node_download_url();
    let node_dir = bundled_node_dir(app).ok_or("Failed to get app data dir")?;

    if let Some(existing) = find_node_binary_in_dir(&node_dir) {
        if existing.exists() {
            return Ok(existing.to_string_lossy().to_string());
        }
    }

    println!("Downloading Node.js from {}", url);

    fs::create_dir_all(&node_dir).map_err(|e| format!("Failed to create dir: {}", e))?;

    let archive_path = node_dir.join(if detect_platform() == "windows" { "node.zip" } else { "node.tar.gz" });

    // Download archive
    let status = if detect_platform() == "windows" {
        let ps_cmd = format!(
            "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri \"{}\" -OutFile \"{}\"",
            url,
            archive_path.display()
        );
        Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_cmd])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .status()
            .map_err(|e| format!("Failed to run PowerShell download: {}", e))?
    } else {
        let curl_cmd = format!(
            "curl -fsSL --progress-bar -o \"{}\" \"{}\"",
            archive_path.display(), url
        );
        Command::new("sh")
            .arg("-c")
            .arg(&curl_cmd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .status()
            .map_err(|e| format!("Failed to run curl: {}", e))?
    };

    if !status.success() {
        return Err("Failed to download Node.js".to_string());
    }

    println!("Extracting Node.js...");

    // Extract
    if detect_platform() == "windows" {
        let ps_cmd = format!(
            "Expand-Archive -Path \"{}\" -DestinationPath \"{}\" -Force",
            archive_path.display(),
            node_dir.display()
        );
        Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_cmd])
            .status()
            .map_err(|e| format!("Failed to unzip: {}", e))?;
    } else {
        // Extract to temp dir then move contents
        let tmp_dir = node_dir.join("_tmp");
        fs::create_dir_all(&tmp_dir).map_err(|e| format!("Failed to create tmp: {}", e))?;
        Command::new("tar")
            .args(["xzf", &archive_path.to_string_lossy(), "-C", &tmp_dir.to_string_lossy()])
            .status()
            .map_err(|e| format!("Failed to extract: {}", e))?;

        // node tarballs have node-vX.Y.Z/ top level
        if let Ok(entries) = fs::read_dir(&tmp_dir) {
            for entry in entries.flatten() {
                let src = entry.path();
                if src.is_dir() {
                    for sub in fs::read_dir(&src).into_iter().flatten().flatten() {
                        let from = sub.path();
                        let to = node_dir.join(sub.file_name());
                        if to.exists() { let _ = fs::remove_dir_all(&to); }
                        let _ = fs::rename(&from, &to);
                    }
                }
            }
        }
        let _ = fs::remove_dir_all(&tmp_dir);
    }

    // Cleanup archive
    let _ = fs::remove_file(&archive_path);

    let node_bin = find_node_binary_in_dir(&node_dir)
        .ok_or_else(|| format!("Node archive extracted but executable was not found under {}", node_dir.display()))?;

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&node_bin, fs::Permissions::from_mode(0o755));
        let _ = fs::set_permissions(node_dir.join("bin").join("npm"), fs::Permissions::from_mode(0o755));
        let _ = fs::set_permissions(node_dir.join("bin").join("npx"), fs::Permissions::from_mode(0o755));
    }

    println!("Node.js installed to: {}", node_bin.display());
    Ok(node_bin.to_string_lossy().to_string())
}

fn find_server_root(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("server");
        if bundled.join("src").join("server.js").exists() {
            return Some(bundled);
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        let dev_root = cwd.join("src-tauri").join("server");
        if dev_root.join("src").join("server.js").exists() {
            return Some(dev_root);
        }

        let project_root = cwd.clone();
        if project_root.join("src").join("server.js").exists() {
            return Some(project_root);
        }

        let parent_root = cwd.join("..");
        if parent_root.join("src").join("server.js").exists() {
            return Some(parent_root.canonicalize().unwrap_or(parent_root));
        }
    }
    None
}

fn validate_server_root(server_root: &Path) -> Result<PathBuf, String> {
    let required = [
        server_root.join("src").join("server.js"),
        server_root.join("src").join("config.js"),
        server_root.join("src").join("installer.js"),
        server_root.join("public").join("index.html"),
    ];

    let missing: Vec<String> = required
        .iter()
        .filter(|path| !path.exists())
        .map(|path| path.display().to_string())
        .collect();

    if !missing.is_empty() {
        return Err(format!("Missing server resources: {}", missing.join(", ")));
    }

    Ok(server_root.join("src").join("server.js"))
}

fn start_server(app: &tauri::AppHandle, node_cmd: &str) -> Result<Child, String> {
    let server_root = find_server_root(app)
        .ok_or_else(|| "Could not find bundled server resources.".to_string())?;
    let server_path = validate_server_root(&server_root)?;

    let child = Command::new(node_cmd)
        .arg(&server_path)
        .current_dir(&server_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PORT", "3456")
        .env("HOST", "127.0.0.1")
        .env("CLAWBOX_DESKTOP", "1")
        .spawn()
        .map_err(|e| format!("Failed to start server: {}", e))?;

    Ok(child)
}

fn wait_for_server(port: u16, timeout_secs: u64) -> bool {
    let start = Instant::now();
    while start.elapsed().as_secs() < timeout_secs {
        if let Ok(mut stream) = TcpStream::connect_timeout(
            &format!("127.0.0.1:{}", port).parse().unwrap(),
            Duration::from_secs(1),
        ) {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
            let _ = stream.write_all(b"GET / HTTP/1.0\r\nHost: localhost\r\n\r\n");
            let mut buf = [0u8; 128];
            if let Ok(n) = stream.read(&mut buf) {
                if n > 0 { return true; }
            }
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

fn loading_page_html() -> String {
    r#"<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{margin:0;background:#09111c;color:#eff5ff;font-family:-apple-system,"PingFang SC",sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}
  .box{text-align:center}
  .spinner{width:40px;height:40px;border:3px solid rgba(122,231,199,0.2);border-top-color:#7ae7c7;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 20px}
  @keyframes spin{to{transform:rotate(360deg)}}
  h2{font-size:18px;font-weight:600;margin-bottom:8px}
  p{color:#95a7c0;font-size:13px}
  .detail{color:#6b7a90;font-size:11px;margin-top:12px}
</style></head>
<body>
<div class="box">
  <div class="spinner"></div>
  <h2>正在启动 ClawBox</h2>
  <p id="status">首次启动需要下载 Node.js，请稍候...</p>
  <p class="detail" id="detail"></p>
</div>
<script>
  setInterval(()=>{
    fetch('http://127.0.0.1:3456/').then(()=>location.href='http://127.0.0.1:3456').catch(()=>{});
  }, 2000);
</script>
</body></html>"#.to_string()
}

fn error_page_html(platform: &str) -> String {
    let hint = match platform {
        "macos" => "请检查网络连接，或从 nodejs.org 手动安装 Node.js",
        "windows" => "请检查网络连接，或从 nodejs.org 下载 LTS 安装包",
        _ => "请检查网络连接，或运行: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt-get install -y nodejs",
    };

    format!(r#"<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{{margin:0;background:#09111c;color:#eff5ff;font-family:-apple-system,"PingFang SC",sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}}
  .card{{max-width:500px;padding:32px;border:1px solid rgba(138,166,205,0.18);border-radius:20px;background:rgba(18,31,49,0.96);text-align:center}}
  h1{{font-size:22px;margin-bottom:12px}}
  p{{color:#c8d6ea;font-size:14px;line-height:1.7;margin-bottom:8px}}
  .hint{{color:#95a7c0;font-size:12px;margin-bottom:20px}}
  .btn{{display:inline-block;padding:10px 20px;border-radius:10px;border:1px solid rgba(138,166,205,0.2);background:linear-gradient(135deg,#9fd2ff,#63b3ff);color:#05111e;font-size:14px;font-weight:700;cursor:pointer}}
</style></head>
<body>
<div class="card">
  <h1>⚠️ 启动失败</h1>
  <p>{hint}</p>
  <p class="hint">安装 Node.js 后重启 ClawBox 即可自动启动。</p>
  <button class="btn" onclick="location.reload()">重试</button>
</div>
</body></html>"#, hint = hint)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Show loading page immediately
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_title("ClawBox — 启动中");
                let html = loading_page_html();
                let _ = w.eval(&format!("document.open(); document.write({}); document.close();", serde_json::to_string(&html).unwrap()));
            }

            // Find or auto-install node
            let node_cmd = match find_node(app.handle()) {
                Some((cmd, ver)) => { println!("Using node {}: {}", ver, cmd); cmd }
                None => {
                    println!("Node.js not found, auto-downloading...");
                    match download_node(app.handle()) {
                        Ok(cmd) => { println!("Auto-installed node at {}", cmd); cmd }
                        Err(e) => {
                            eprintln!("Auto-install failed: {}", e);
                            let html = error_page_html(detect_platform());
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.set_title("ClawBox — 需要 Node.js");
                                let _ = w.eval(&format!("document.open(); document.write({}); document.close();", serde_json::to_string(&html).unwrap()));
                            }
                            return Ok(());
                        }
                    }
                }
            };

            // Start server
            match start_server(app.handle(), &node_cmd) {
                Ok(child) => {
                    app.manage(Mutex::new(AppState { server_process: Some(child) }));
                    if wait_for_server(3456, 30) {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.set_title("ClawBox");
                            let _ = w.navigate("http://127.0.0.1:3456".parse().unwrap());
                        }
                    } else {
                        eprintln!("Server did not start within 30s");
                        let html = error_page_html(detect_platform());
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.set_title("ClawBox — 启动超时");
                            let _ = w.eval(&format!("document.open(); document.write({}); document.close();", serde_json::to_string(&html).unwrap()));
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Failed to start server: {}", e);
                    let html = error_page_html(detect_platform());
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.set_title("ClawBox — 错误");
                        let _ = w.eval(&format!("document.open(); document.write({}); document.close();", serde_json::to_string(&html).unwrap()));
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
