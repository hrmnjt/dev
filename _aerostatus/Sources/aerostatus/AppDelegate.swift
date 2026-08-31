import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var controller: StatusController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let controller = StatusController()
        controller.start()
        self.controller = controller
    }
}
