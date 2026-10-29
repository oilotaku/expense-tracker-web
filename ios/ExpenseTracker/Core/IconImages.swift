import UIKit

/// Custom icon PNGs by uid. Content never changes for a uid (ADR-0006), so disk copies never need revalidating
/// and keep working offline.
actor IconImageCache {
    static let shared = IconImageCache()

    private let memory = NSCache<NSString, UIImage>()
    private var inFlight: [UUID: Task<UIImage?, Never>] = [:]
    private let directory: URL = {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("custom-icons", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    func image(for uid: UUID) async -> UIImage? {
        if let hit = memory.object(forKey: uid.uuidString as NSString) { return hit }
        if let running = inFlight[uid] { return await running.value }
        let file = directory.appendingPathComponent("\(uid.uuidString).png")
        let task = Task<UIImage?, Never> {
            if let data = try? Data(contentsOf: file), let img = UIImage(data: data) { return img }
            guard let data = try? await APIClient.shared.getData("/icons/\(uid.uuidString)"),
                  let img = UIImage(data: data) else { return nil }
            try? data.write(to: file, options: .atomic)
            return img
        }
        inFlight[uid] = task
        let result = await task.value
        inFlight[uid] = nil
        if let result { memory.setObject(result, forKey: uid.uuidString as NSString) }
        return result
    }

    func clear() {
        memory.removeAllObjects()
        try? FileManager.default.removeItem(at: directory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
}

enum CustomIcon {
    static let prefix = "custom:"

    static func uid(_ key: String) -> UUID? {
        guard key.hasPrefix(prefix) else { return nil }
        return UUID(uuidString: String(key.dropFirst(prefix.count)))
    }
}

enum IconImagePrep {
    /// Same client-side step as the web app (ADR-0006 §4): long edge ≤ 1024, re-encoded as PNG.
    /// `UIImage(data:)` already decodes HEIC and applies the EXIF orientation when drawing.
    static func prepare(_ data: Data, maxEdge: CGFloat = 1024) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let size = image.size
        let scale = min(1, maxEdge / max(size.width, size.height))
        let target = CGSize(width: max(1, (size.width * scale).rounded()), height: max(1, (size.height * scale).rounded()))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = false
        let rendered = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        return rendered.pngData()
    }
}
