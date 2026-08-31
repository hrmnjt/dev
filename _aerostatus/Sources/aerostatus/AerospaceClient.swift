import Foundation

struct WorkspaceState {
    let name: String
    let focused: Bool
    let occupied: Bool
}

enum AerospaceClient {
    private static var executablePath: String {
        let candidates = [
            "/opt/homebrew/bin/aerospace",
            "/usr/local/bin/aerospace",
        ]
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) } ?? "aerospace"
    }

    /// Run an `aerospace` subcommand and return trimmed stdout.
    static func run(_ arguments: [String]) throws -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executablePath)
        process.arguments = arguments
        process.standardError = Pipe()

        let pipe = Pipe()
        process.standardOutput = pipe

        try process.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()

        guard process.terminationStatus == 0 else {
            throw AerospaceError.commandFailed(arguments.joined(separator: " "))
        }
        return String(data: data, encoding: .utf8) ?? ""
    }

    /// Query the full workspace state: every workspace, its occupancy, and focus.
    /// Returns nil when AeroSpace is unavailable so the indicator can idle.
    static func currentState() -> [WorkspaceState]? {
        guard
            let focused = trimmedLines(of: try? run(["list-workspaces", "--focused"])).first,
            let allOutput = try? run(["list-workspaces", "--all"]),
            let occupiedOutput = try? run(["list-windows", "--all", "--format", "%{workspace}"])
        else { return nil }

        let names = trimmedLines(of: allOutput)
        guard !names.isEmpty else { return nil }

        let occupied = Set(trimmedLines(of: occupiedOutput))
        return names.map { name in
            WorkspaceState(name: name, focused: name == focused, occupied: occupied.contains(name))
        }
    }

    static func switchToWorkspace(_ name: String) {
        _ = try? run(["workspace", name])
    }

    private static func trimmedLines(of output: String?) -> [String] {
        (output ?? "")
            .split(separator: "\n")
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }
}

enum AerospaceError: Error {
    case commandFailed(String)
}
