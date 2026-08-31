import Foundation

/// Listens on a per-user Unix socket for messages from `aerostatus --notify`.
final class SocketServer {
    private let path: String
    private let onMessage: (String) -> Void
    private let queue = DispatchQueue(label: "aerostatus.socket", qos: .utility)

    init(onMessage: @escaping (String) -> Void) {
        self.path = SocketServer.socketPath()
        self.onMessage = onMessage
    }

    static func socketPath() -> String {
        "/tmp/aerostatus.\(getuid()).sock"
    }

    func start() {
        queue.async { self.listen() }
    }

    private func listen() {
        // Remove a stale socket left behind by a previous instance.
        unlink(path)

        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { return }
        defer { close(fd) }

        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let pathBytes = Array(path.utf8)
        withUnsafeMutableBytes(of: &address.sun_path) { pointer in
            pathBytes.copyBytes(to: pointer, count: min(pathBytes.count, pointer.count - 1))
        }

        let bindResult = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketPointer in
                bind(fd, socketPointer, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bindResult == 0, listen(fd, 8) == 0 else { return }

        while true {
            let client = accept(fd, nil, nil)
            guard client >= 0 else { break }

            var buffer = [UInt8](repeating: 0, count: 512)
            let count = read(client, &buffer, buffer.count - 1)
            close(client)

            guard count > 0 else { continue }
            let message = String(bytes: buffer.prefix(count), encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !message.isEmpty else { continue }

            DispatchQueue.main.async { self.onMessage(message) }
        }
    }
}

/// One-shot client used by `aerostatus --notify`.
enum NotifyClient {
    static func send(_ message: String) {
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { return }
        defer { close(fd) }

        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let path = SocketServer.socketPath()
        let pathBytes = Array(path.utf8)
        withUnsafeMutableBytes(of: &address.sun_path) { pointer in
            pathBytes.copyBytes(to: pointer, count: min(pathBytes.count, pointer.count - 1))
        }

        let connectResult = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketPointer in
                connect(fd, socketPointer, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard connectResult == 0 else { return }

        let payload = Array((message + "\n").utf8)
        payload.withUnsafeBufferPointer { buffer in
            _ = write(fd, buffer.baseAddress, payload.count)
        }
    }
}
