import AppKit

/// Owns the status item, refreshes state, and routes clicks to AeroSpace.
final class StatusController: NSObject {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let stripView = WorkspaceStripView()
    private var server: SocketServer?
    private var reconcileTimer: Timer?

    /// Re-query AeroSpace after a click in case the change event is missed.
    private static let postClickRefreshDelay: TimeInterval = 0.3

    func start() {
        guard let button = statusItem.button else { return }

        button.title = ""
        button.addSubview(stripView)

        stripView.onSelect = { [weak self] name in
            AerospaceClient.switchToWorkspace(name)
            DispatchQueue.main.asyncAfter(deadline: .now() + StatusController.postClickRefreshDelay) {
                self?.refresh()
            }
        }
        stripView.onPreferredWidthChanged = { [weak self] width in
            self?.resize(for: width)
        }

        server = SocketServer { [weak self] _ in
            self?.refresh()
        }
        server?.start()

        refresh()

        // Safety net: reconcile occupancy every minute in case an event is missed.
        reconcileTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    func refresh() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let states = AerospaceClient.currentState() else { return }
            DispatchQueue.main.async {
                self?.stripView.update(states)
            }
        }
    }

    private func resize(for width: CGFloat) {
        statusItem.length = width
        if let button = statusItem.button {
            button.layoutSubtreeIfNeeded()
            stripView.frame = button.bounds
            stripView.needsDisplay = true
        }
    }
}
