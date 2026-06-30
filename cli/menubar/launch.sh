#!/bin/bash
BIN="$(cd "$(dirname "$0")" && pwd)/erdbpro-tray"
PORT="${1:-3101}"
[ -f "$BIN" ] && nohup "$BIN" "$PORT" >/dev/null 2>&1 & disown
