# ClawBox Project

## Overview
ClawBox is a local web-based management tool for OpenClaw. It provides a graphical interface for one-click installation, configuration, and management of OpenClaw instances.

## Tech Stack
- **Backend**: Node.js (Express), single file `src/server.js`
- **Frontend**: Vanilla HTML/CSS/JS, single page `public/index.html` + `public/js/app.js`
- **Config**: Reads/writes `~/.openclaw/openclaw.json`
- **Port**: 3456
- **Version**: v0.4.5

## Key Files
- `src/server.js` — API endpoints
- `src/config.js` — Config read/write/switch logic
- `src/installer.js` — OpenClaw install/uninstall/status
- `public/index.html` — Main UI
- `public/js/app.js` — All frontend logic (tabs, skills, models, channels)
- `public/css/style.css` — Styles

## Code Style
- UI text: **Chinese (中文)** for all user-facing labels, buttons, descriptions
- Code comments: English
- Variable/function names: English/camelCase

## Important Rules
- All user-facing text must be in Chinese
- The UI is mobile-first responsive design
- Test after changes: `node -c src/server.js && node -c public/js/app.js`
