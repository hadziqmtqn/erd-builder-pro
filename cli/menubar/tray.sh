#!/usr/bin/env bash
# macOS menubar tray icon via AppleScript — no Xcode required
# Spawns a tiny AppleScript applet that shows a menubar item.

PORT="${1:-3101}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

osascript -e "
use AppleScript version \"2.4\"
use framework \"AppKit\"
use scripting additions

property statusItem : missing value

on run
    set myPort to \"$PORT\"
    
    -- Create status bar item
    set bar to current application's NSStatusBar's systemStatusBar
    set statusItem to bar's statusItemWithLength:(current application's NSSquareStatusItemLength)
    
    -- Set icon
    set button to statusItem's button
    button's setTitle:\"◈\"
    button's setToolTip:\"ERD Builder Pro\"
    
    -- Create menu
    set theMenu to current application's NSMenu's alloc()'s init()
    
    set openItem to current application's NSMenuItem's alloc()'s initWithTitle:\"Open ERD Builder Pro\" action:\"openApp:\" keyEquivalent:\"o\"
    openItem's setTarget:me
    theMenu's addItem:openItem
    
    theMenu's addItem:(current application's NSMenuItem's separatorItem)
    
    set quitItem to current application's NSMenuItem's alloc()'s initWithTitle:\"Quit\" action:\"quitApp:\" keyEquivalent:\"q\"
    quitItem's setTarget:me
    theMenu's addItem:quitItem
    
    statusItem's setMenu:theMenu
    
    -- Open browser
    openApp(myPort)
end run

on openApp:port
    set urlStr to \"http://localhost:\" & port
    set theURL to current application's NSURL's URLWithString:urlStr
    current application's NSWorkspace's sharedWorkspace's openURL:theURL
end openApp:

on quitApp:sender
    current application's NSApplication's sharedApplication's terminate:me
end quitApp:
"

# Keep running until killed
echo "ERD Builder Pro menubar icon active (port $PORT). Ctrl+C to quit."
while true; do sleep 3600; done
