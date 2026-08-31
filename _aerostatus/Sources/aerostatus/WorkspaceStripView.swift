import AppKit

/// Draws the workspace strip inside the status item.
///
/// Styling mirrors the previous SketchyBar treatment:
/// - focused workspace: yellow block with dark text
/// - occupied workspace: gray block with muted text
/// - empty workspace: muted text only
final class WorkspaceStripView: NSView {
    var onSelect: ((String) -> Void)?
    var onPreferredWidthChanged: ((CGFloat) -> Void)?

    private var workspaces: [WorkspaceState] = []

    // Classic Gruvbox palette.
    private let focusFill = NSColor(srgbRed: 0.980, green: 0.741, blue: 0.184, alpha: 1) // #fabd2f
    private let focusText = NSColor(srgbRed: 0.114, green: 0.125, blue: 0.129, alpha: 1) // #1d2021
    private let occupiedFill = NSColor(srgbRed: 0.235, green: 0.220, blue: 0.204, alpha: 1) // #3c3836
    private let occupiedText = NSColor(srgbRed: 0.659, green: 0.600, blue: 0.518, alpha: 1) // #a89984
    private let emptyText = NSColor(srgbRed: 0.486, green: 0.435, blue: 0.392, alpha: 1) // #7c6f64

    private let leadingInset: CGFloat = 4
    private let cellSpacing: CGFloat = 4
    private let blockPadding: CGFloat = 5

    private static let font: NSFont = {
        NSFont(name: "JetBrainsMono Nerd Font Mono", size: 13)
            ?? NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .medium)
    }()

    func update(_ workspaces: [WorkspaceState]) {
        self.workspaces = workspaces
        needsDisplay = true
        onPreferredWidthChanged?(preferredWidth)
    }

    var preferredWidth: CGFloat {
        guard !workspaces.isEmpty else { return 24 }
        let textWidths = workspaces.map { textWidth(of: $0.name) + blockPadding * 2 }
        let total = textWidths.reduce(0, +)
        let spacing = cellSpacing * CGFloat(max(workspaces.count - 1, 0))
        return leadingInset * 2 + total + spacing
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard !workspaces.isEmpty else { return }

        let height = bounds.height
        let blockHeight = min(height - 8, 18)
        let blockY = (height - blockHeight) / 2

        var x = leadingInset
        for state in workspaces {
            let cellWidth = textWidth(of: state.name) + blockPadding * 2

            if state.focused || state.occupied {
                let rect = NSRect(x: x, y: blockY, width: cellWidth, height: blockHeight)
                (state.focused ? focusFill : occupiedFill).setFill()
                NSBezierPath(roundedRect: rect, xRadius: 5, yRadius: 5).fill()
            }

            let color: NSColor
            if state.focused {
                color = focusText
            } else if state.occupied {
                color = occupiedText
            } else {
                color = emptyText
            }

            let attributes: [NSAttributedString.Key: Any] = [
                .font: Self.font,
                .foregroundColor: color,
            ]
            let textSize = (state.name as NSString).size(withAttributes: attributes)
            let textOrigin = NSPoint(x: x + blockPadding, y: (height - textSize.height) / 2)
            (state.name as NSString).draw(at: textOrigin, withAttributes: attributes)

            x += cellWidth + cellSpacing
        }
    }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if let state = state(at: point) {
            onSelect?(state.name)
        }
    }

    private func state(at point: NSPoint) -> WorkspaceState? {
        var x = leadingInset
        for state in workspaces {
            let cellWidth = textWidth(of: state.name) + blockPadding * 2
            if point.x >= x, point.x <= x + cellWidth {
                return state
            }
            x += cellWidth + cellSpacing
        }
        return nil
    }

    private func textWidth(of name: String) -> CGFloat {
        (name as NSString).size(withAttributes: [.font: Self.font]).width
    }
}
