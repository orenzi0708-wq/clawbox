// ClawBox Tauri Desktop App
// Detects Node.js on startup; shows install guide if missing.

use std::io::{Read, Write};
use std::net::TcpStream;
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

/// Check if node is available and meets minimum version (>= 18)
fn detect_node() -> Option<String> {
    Command::new("node")
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .ok()
        .and_then(|out| {
            let ver = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if out.status.success() && ver.starts_with('v') {
                let major: u32 = ver.trim_start_matches('v')
                    .split('.')
                    .next()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                if major >= 18 {
                    Some(ver)
                } else {
                    None
                }
            } else {
                None
            }
        })
}

fn detect_platform() -> &'static str {
    #[cfg(target_os = "macos")]
    { "macos" }
    #[cfg(target_os = "windows")]
    { "windows" }
    #[cfg(target_os = "linux")]
    { "linux" }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    { "unknown" }
}

fn find_server_js(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    // Try bundled resource path first (installed app)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("server").join("src").join("server.js");
        if bundled.exists() {
            return Some(bundled);
        }
    }

    // Try relative to current dir (development mode)
    if let Ok(cwd) = std::env::current_dir() {
        // src-tauri/target/release/ -> project root
        let dev_path = cwd.join("src").join("server.js");
        if dev_path.exists() {
            return Some(dev_path);
        }
        // src-tauri/ -> project root
        let dev_path2 = cwd.join("..").join("src").join("server.js");
        if dev_path2.exists() {
            return Some(dev_path2.canonicalize().unwrap_or(dev_path2));
        }
    }

    None
}

fn start_server(app: &tauri::AppHandle) -> Result<Child, String> {
    let server_path = find_server_js(app)
        .ok_or_else(|| "Could not find server.js. Make sure the app is installed correctly.".to_string())?;

    let work_dir = server_path
        .parent()                       // server/src/
        .and_then(|p| p.parent())       // server/
        .and_then(|p| p.parent())       // resource_dir/ or project root
        .ok_or("Failed to determine working directory")?
        .to_path_buf();

    let child = Command::new("node")
        .arg(&server_path)
        .current_dir(&work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PORT", "3456")
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
                if n > 0 {
                    return true;
                }
            }
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

fn setup_page_html(platform: &str) -> String {
    let (install_cmd, install_hint) = match platform {
        "macos" => (
            "brew install node",
            "需要先安装 Homebrew。如果没有，访问 <a href='https://brew.sh'>brew.sh</a>"
        ),
        "windows" => (
            "winget install OpenJS.NodeJS.LTS",
            "打开 PowerShell（管理员）执行上方命令，或手动下载 Node.js LTS"
        ),
        _ => (
            "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && source ~/.bashrc && nvm install --lts",
            "通过 nvm 安装，不需要 sudo 权限"
        ),
    };

    let clawhub_cmd = "npm install -g clawhub";

    format!(r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ClawBox Setup</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    font-family: -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
    background: #09111c;
    color: #eff5ff;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .card {{
    max-width: 560px;
    padding: 36px 32px;
    border: 1px solid rgba(138,166,205,0.18);
    border-radius: 24px;
    background: linear-gradient(180deg, rgba(255,255,255,0.035), transparent 24%), rgba(18,31,49,0.96);
    box-shadow: 0 24px 80px rgba(0,0,0,0.42);
  }}
  .kicker {{
    color: #7ae7c7;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 10px;
  }}
  h1 {{
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.03em;
    margin-bottom: 12px;
  }}
  .desc {{
    color: #c8d6ea;
    font-size: 14px;
    line-height: 1.7;
    margin-bottom: 28px;
  }}
  .step {{
    margin-bottom: 20px;
  }}
  .step-title {{
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }}
  .step-num {{
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(98,176,255,0.15);
    color: #62b0ff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 800;
  }}
  code {{
    display: block;
    padding: 12px 14px;
    border: 1px solid rgba(138,166,205,0.18);
    border-radius: 12px;
    background: rgba(7,14,24,0.9);
    color: #a8d7ff;
    font-family: "SF Mono", "Fira Code", "Consolas", monospace;
    font-size: 13px;
    word-break: break-all;
    cursor: pointer;
    transition: border-color 0.15s;
  }}
  code:hover {{ border-color: rgba(98,176,255,0.5); }}
  .hint {{
    color: #95a7c0;
    font-size: 12px;
    margin-top: 6px;
  }}
  .copy-toast {{
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(-60px);
    background: rgba(77,224,166,0.15);
    border: 1px solid rgba(77,224,166,0.3);
    color: #4de0a6;
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    opacity: 0;
    transition: all 0.3s;
    pointer-events: none;
  }}
  .copy-toast.show {{
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }}
  .divider {{
    border: 0;
    border-top: 1px solid rgba(138,166,205,0.12);
    margin: 24px 0;
  }}
  .actions {{
    display: flex;
    gap: 10px;
    margin-top: 8px;
  }}
  .btn {{
    flex: 1;
    padding: 12px;
    border: 1px solid transparent;
    border-radius: 14px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }}
  .btn-primary {{
    color: #05111e;
    background: linear-gradient(135deg, #9fd2ff, #63b3ff 60%, #64efc1);
  }}
  .btn-primary:hover {{ box-shadow: 0 8px 20px rgba(62,145,238,0.25); }}
  .btn-secondary {{
    color: #eff5ff;
    border-color: rgba(138,166,205,0.18);
    background: rgba(255,255,255,0.04);
  }}
  .btn-secondary:hover {{ background: rgba(255,255,255,0.07); }}
  .note {{
    margin-top: 20px;
    padding: 12px 14px;
    border: 1px solid rgba(138,166,205,0.12);
    border-radius: 12px;
    background: rgba(255,255,255,0.03);
    color: #95a7c0;
    font-size: 12px;
    line-height: 1.6;
  }}
</style>
</head>
<body>
<div class="copy-toast" id="toast">已复制到剪贴板</div>
<div class="card">
  <div class="kicker">First Launch Setup</div>
  <h1>安装依赖</h1>
  <p class="desc">ClawBox 需要 Node.js 运行时和 ClawHub CLI。按以下步骤安装后，点击"刷新"即可启动。</p>

  <div class="step">
    <div class="step-title"><span class="step-num">1</span>安装 Node.js（>= 18）</div>
    <code onclick="copyCmd(this)">{install_cmd}</code>
    <div class="hint">{install_hint}</div>
  </div>

  <hr class="divider">

  <div class="step">
    <div class="step-title"><span class="step-num">2</span>安装 ClawHub CLI</div>
    <code onclick="copyCmd(this)">{clawhub_cmd}</code>
    <div class="hint">安装完 Node.js 后执行，用于管理 Skills</div>
  </div>

  <hr class="divider">

  <div class="note">
    💡 安装完成后如果开了新终端，可能需要重启 ClawBox 让 PATH 生效。<br>
    安装 OpenClaw 可以启动后在面板中一键完成。
  </div>

  <div class="actions">
    <button class="btn btn-primary" onclick="location.reload()">刷新重试</button>
    <button class="btn btn-secondary" onclick="window.__TAURI__?.shell?.open('https://nodejs.org')">前往 Node.js 官网</button>
  </div>
</div>
<script>
function copyCmd(el) {{
  navigator.clipboard.writeText(el.textContent.trim()).then(() => {{
    const t = document.getElementById('toast');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1500);
  }});
}}
</script>
</body>
</html>"#, install_cmd = install_cmd, install_hint = install_hint, clawhub_cmd = clawhub_cmd)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            match detect_node() {
                Some(version) => {
                    println!("Node.js detected: {}", version);
                    match start_server(app.handle()) {
                        Ok(child) => {
                            app.manage(Mutex::new(AppState {
                                server_process: Some(child),
                            }));
                            if wait_for_server(3456, 15) {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.navigate("http://127.0.0.1:3456".parse().unwrap());
                                }
                            } else {
                                eprintln!("Warning: Server did not start within timeout");
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to start server: {}", e);
                            let platform = detect_platform();
                            let html = setup_page_html(platform);
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.set_title("ClawBox — Error");
                                let _ = window.eval(&format!("document.open(); document.write({}); document.close();", serde_json::to_string(&html).unwrap()));
                            }
                        }
                    }
                }
                None => {
                    println!("Node.js not found, showing setup page");
                    let platform = detect_platform();
                    let html = setup_page_html(platform);
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.set_title("ClawBox — 安装依赖");
                        let _ = window.eval(&format!("document.open(); document.write({}); document.close();", serde_json::to_string(&html).unwrap()));
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
