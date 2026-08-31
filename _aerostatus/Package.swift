// swift-tools-version:5.9

// AeroStatus - a tiny native macOS menu-bar indicator for AeroSpace workspaces.
// See README.md in this directory for build and design notes.
import PackageDescription

let package = Package(
    name: "AeroStatus",
    platforms: [
        .macOS(.v13),
    ],
    targets: [
        .executableTarget(
            name: "aerostatus",
            path: "Sources/aerostatus"
        ),
    ]
)
