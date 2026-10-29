import Foundation

enum OfflineFiles {
    static let root: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("offline", isDirectory: true)
    }()

    /// Ledger data stays encrypted at rest while the phone is locked.
    static var writeOptions: Data.WritingOptions {
        #if os(iOS)
        [.atomic, .completeFileProtectionUnlessOpen]
        #else
        [.atomic]
        #endif
    }

    static func write(_ data: Data, to url: URL) {
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: writeOptions)
    }
}

/// Last good copy of every GET response, so screens still have something to show when the
/// server (or Tailscale) is unreachable. Belongs to one user: AppState wipes it on logout or user switch.
final class ResponseCache {
    static let shared = ResponseCache()

    struct Entry {
        let data: Data
        let savedAt: Date
    }

    private let dir = OfflineFiles.root.appendingPathComponent("responses", isDirectory: true)

    func store(_ data: Data, for key: String) {
        OfflineFiles.write(data, to: file(key))
    }

    func load(_ key: String) -> Entry? {
        let url = file(key)
        guard let data = try? Data(contentsOf: url) else { return nil }
        let savedAt = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
        return Entry(data: data, savedAt: savedAt)
    }

    func clear() {
        try? FileManager.default.removeItem(at: dir)
    }

    private func file(_ key: String) -> URL {
        // FNV-1a 64: stable across launches (Hasher is seeded per process)
        var h: UInt64 = 0xcbf2_9ce4_8422_2325
        for b in key.utf8 {
            h ^= UInt64(b)
            h = h &* 0x100_0000_01b3
        }
        return dir.appendingPathComponent(String(format: "%016llx.json", h))
    }
}

/// A new transaction recorded while offline, waiting to be POSTed.
struct PendingWrite: Codable, Hashable, Identifiable {
    enum Payload: Codable, Hashable {
        case transaction(TransactionWrite)
        case transfer(TransferWrite)
    }

    enum Status: String, Codable {
        /// sent automatically once the server is reachable
        case waiting
        /// the last attempt timed out mid-flight: it may already be on the server, so the user decides
        case uncertain
        /// the server rejected it (e.g. the account was deleted meanwhile)
        case failed
    }

    let id: UUID
    let ownerUID: UUID
    let createdAt: Date
    let payload: Payload
    var status: Status = .waiting
    var lastError: String?

    /// A stand-in row so pending items render with the normal TransactionRow.
    var preview: Transaction {
        switch payload {
        case let .transaction(b):
            Transaction(transaction_uid: id, account_uid: b.account_uid, category_uid: b.category_uid,
                        transaction_date: b.transaction_date, description: b.description, amount: b.amount,
                        transaction_type: b.transaction_type, payment_method: b.payment_method, tags: [],
                        transfer_group_uid: nil, transfer_direction: nil, transfer_counterpart_account_uid: nil)
        case let .transfer(b):
            Transaction(transaction_uid: id, account_uid: b.from_account_uid, category_uid: nil,
                        transaction_date: b.transaction_date, description: b.description, amount: b.amount,
                        transaction_type: .transfer, payment_method: b.payment_method, tags: [],
                        transfer_group_uid: id, transfer_direction: .out, transfer_counterpart_account_uid: b.to_account_uid)
        }
    }
}

enum PendingStore {
    private static let url = OfflineFiles.root.appendingPathComponent("pending.json")

    static func load() -> [PendingWrite] {
        guard let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([PendingWrite].self, from: data)) ?? []
    }

    static func save(_ items: [PendingWrite]) {
        guard let data = try? JSONEncoder().encode(items) else { return }
        OfflineFiles.write(data, to: url)
    }
}
