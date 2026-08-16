import Cocoa
import Foundation

let port = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "3101"
let home = FileManager.default.homeDirectoryForCurrentUser
let pidFile = home.appendingPathComponent(".erdbpro/server.pid").path
let updateFile = home.appendingPathComponent(".erdbpro/update.json").path
let executableDirectory = URL(
    fileURLWithPath: CommandLine.arguments[0],
    relativeTo: URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
).standardizedFileURL.deletingLastPathComponent()

class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    var statusItem: NSStatusItem!
    var statusMenuItem: NSMenuItem!
    var updateMenuItem: NSMenuItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

        if let button = statusItem.button {
            let iconCandidates = [
                executableDirectory.appendingPathComponent("icon.svg").path,
                Bundle.main.resourceURL?.appendingPathComponent("icon.svg").path
            ]
            for iconPath in iconCandidates.compactMap({ $0 }) {
                if let img = NSImage(contentsOfFile: iconPath) {
                    img.size = NSSize(width: 18, height: 18)
                    button.image = img
                    break
                }
            }
            if button.image == nil { button.title = "ERD" }
            button.toolTip = "ERD Builder Pro"
        }

        let menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false

        statusMenuItem = NSMenuItem(title: "Server: checking...", action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        menu.addItem(statusMenuItem)
        menu.addItem(NSMenuItem.separator())

        updateMenuItem = NSMenuItem(title: "", action: #selector(showUpdate), keyEquivalent: "")
        updateMenuItem.target = self
        updateMenuItem.isHidden = true
        menu.addItem(updateMenuItem)

        let openItem = NSMenuItem(title: "Open ERD Builder Pro", action: #selector(openApp), keyEquivalent: "o")
        openItem.target = self
        menu.addItem(openItem)
        menu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: "Quit", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu

        signal(SIGTERM) { _ in
            NSApplication.shared.terminate(nil)
        }
    }

    func menuWillOpen(_ menu: NSMenu) {
        // Server status
        if let pidStr = try? String(contentsOfFile: pidFile, encoding: .utf8) {
            let pid = pidStr.trimmingCharacters(in: .whitespacesAndNewlines)
            if let pidNum = Int32(pid), kill(pidNum, 0) == 0 {
                statusMenuItem.title = "Server: Running (PID: \(pid))"
            } else {
                statusMenuItem.title = "Server: Stopped"
            }
        } else {
            statusMenuItem.title = "Server: Stopped"
        }

        // Update notification
        if let data = try? Data(contentsOf: URL(fileURLWithPath: updateFile)),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let hasUpdate = json["hasUpdate"] as? Bool, hasUpdate,
           let latest = json["latest"] as? String {
            let attr = NSAttributedString(
                string: "Update Available: v\(latest)",
                attributes: [.foregroundColor: NSColor.systemGreen]
            )
            updateMenuItem.attributedTitle = attr
            updateMenuItem.isHidden = false
        } else {
            updateMenuItem.isHidden = true
        }
    }

    @objc func openApp() {
        if let url = URL(string: "http://localhost:\(port)") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc func showUpdate() {
        // Open GitHub releases
        if let url = URL(string: "https://github.com/hadziqmtqn/erd-builder-pro/releases/latest") {
            NSWorkspace.shared.open(url)
        }
        // Show update instructions
        let alert = NSAlert()
        alert.messageText = "Update ERD Builder Pro"
        alert.informativeText = "Run this command in your terminal:\n\nnpm install -g erdbpro@latest --prefer-online\n\nThen restart with: erdbpro start --force"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        DispatchQueue.main.async { alert.runModal() }
    }

    @objc func quitApp() {
        if let pidStr = try? String(contentsOfFile: pidFile, encoding: .utf8) {
            let pid = pidStr.trimmingCharacters(in: .whitespacesAndNewlines)
            if let pidNum = Int32(pid) {
                kill(pidNum, SIGTERM)
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
