import AppKit
import Foundation

// Two modes:
//
// 1. Default: run the menu-bar app.
// 2. `--notify <workspace>`: sent by AeroSpace's exec-on-workspace-change;
//    forwards the message to the running instance over a Unix socket and exits.
//
// The split keeps the AeroSpace hook cheap (a connection, not a launch).

let arguments = CommandLine.arguments

if let index = arguments.firstIndex(of: "--notify"), index + 1 < arguments.count {
    NotifyClient.send("workspace \(arguments[index + 1])")
    exit(0)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let delegate = AppDelegate()
app.delegate = delegate
app.run()
