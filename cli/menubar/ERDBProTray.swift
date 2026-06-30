import Cocoa
import Foundation

let port = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "3101"
let home = FileManager.default.homeDirectoryForCurrentUser
let pidFile = home.appendingPathComponent(".erdbpro/server.pid").path

class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    var statusItem: NSStatusItem!
    var statusMenuItem: NSMenuItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

        if let button = statusItem.button {
            // Load custom icon, fallback to "ERD" text
            let iconCandidates = [
                Bundle.main.bundlePath + "/../icon.svg",
                "\(FileManager.default.homeDirectoryForCurrentUser.path)/Projects/erd-builder-pro/cli/menubar/icon.svg"
            ]
            var iconLoaded = false
            for iconPath in iconCandidates {
                if let img = NSImage(contentsOfFile: iconPath) {
                    img.size = NSSize(width: 18, height: 18)
                    button.image = img
                    iconLoaded = true
                    break
                }
            }
            if !iconLoaded { button.title = "ERD" }
            button.toolTip = "ERD Builder Pro"
        }

        let menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false

        statusMenuItem = NSMenuItem(title: "Server: checking...", action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        menu.addItem(statusMenuItem)
        menu.addItem(NSMenuItem.separator())

        let openItem = NSMenuItem(title: "Open ERD Builder Pro", action: #selector(openApp), keyEquivalent: "o")
        openItem.target = self
        menu.addItem(openItem)
        menu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: "Quit", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu

        // Handle SIGTERM (from pkill / erdbpro stop)
        signal(SIGTERM) { _ in
            NSApplication.shared.terminate(nil)
        }
    }

    func menuWillOpen(_ menu: NSMenu) {
        if let pidStr = try? String(contentsOfFile: pidFile, encoding: .utf8) {
            let pid = pidStr.trimmingCharacters(in: .whitespacesAndNewlines)
            if let pidNum = Int32(pid), kill(pidNum, 0) == 0 {
                statusMenuItem.title = "Server: Running (PID: \(pid))"
                return
            }
        }
        statusMenuItem.title = "Server: Stopped"
    }

    @objc func openApp() {
        if let url = URL(string: "http://localhost:\(port)") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc func quitApp() {
        // Stop server via PID file
        if let pidStr = try? String(contentsOfFile: pidFile, encoding: .utf8) {
            let pid = pidStr.trimmingCharacters(in: .whitespacesAndNewlines)
            if let pidNum = Int32(pid) {
                kill(pidNum, SIGTERM)
                // Server handles PID file cleanup on exit
            }
        }
        NSApplication.shared.terminate(nil)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
