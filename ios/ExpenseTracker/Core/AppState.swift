import Foundation
import Observation

@MainActor
@Observable
final class AppState {
    enum Phase { case launching, needsServer, loggedOut, loggedIn }

    var phase: Phase = .launching
    /// Set when the last session check failed for a reason other than 401 (cookie may still be valid).
    var bootstrapError: String?
    var user: User?
    var accounts: [Account] = [] { didSet { accountIndex = Dictionary(uniqueKeysWithValues: accounts.map { ($0.account_uid, $0) }) } }
    var categories: [Category] = [] { didSet { categoryIndex = Dictionary(uniqueKeysWithValues: categories.map { ($0.category_uid, $0) }) } }
    /// Custom icons (ADR-0006); used by the icon picker and the 我的圖示 screen.
    var icons: [UserIcon] = []
    var iconQuota = IconQuota(used: 0, limit: 50)
    private var accountIndex: [UUID: Account] = [:]
    private var categoryIndex: [UUID: Category] = [:]
    /// Bumped after any write so list screens know to reload.
    var revision = 0

    /// The last request couldn't reach the server; screens are showing cached copies.
    var isOffline = false
    /// Oldest cached response shown since going offline.
    var offlineDataAt: Date?
    /// Transactions recorded offline, all users (each item carries its owner).
    var pending: [PendingWrite] = PendingStore.load() { didSet { PendingStore.save(pending) } }
    /// Short note after an automatic upload, shown in the offline banner.
    var syncNote: String?
    private var syncTask: Task<Void, Never>?
    private var monitor: Task<Void, Never>?

    private let api = APIClient.shared

    init() {
        api.onUnauthorized = { [weak self] in self?.handleUnauthorized() }
        api.onReachability = { [weak self] online, cachedAt in self?.reachability(online: online, cachedAt: cachedAt) }
    }

    var myPending: [PendingWrite] {
        guard let uid = user?.user_uid else { return [] }
        return pending.filter { $0.ownerUID == uid }
    }

    var serverURL: String {
        get { UserDefaults.standard.string(forKey: "serverURL") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "serverURL") }
    }

    /// The device remembers who logged in last so PIN login can skip the email.
    var rememberedUser: (uid: UUID, email: String)? {
        guard let s = UserDefaults.standard.string(forKey: "pinUserUID"), let uid = UUID(uuidString: s),
              let email = UserDefaults.standard.string(forKey: "pinUserEmail") else { return nil }
        return (uid, email)
    }

    func bootstrap() async {
        guard api.baseURL != nil else { phase = .needsServer; return }
        do {
            let me: User = try await api.get("/auth/me")
            bootstrapError = nil
            await didLogin(me)
        } catch let e as APIError where e.status == 401 {
            bootstrapError = nil
            phase = .loggedOut
        } catch {
            // network/Tailscale not ready: keep the cookie, let the user retry from the login screen
            bootstrapError = error.localizedDescription
            phase = .loggedOut
        }
    }

    func login(email: String, password: String) async throws {
        bootstrapError = nil
        let me: User = try await api.post("/auth/login", LoginRequest(email: email, password: password))
        await didLogin(me)
    }

    func loginWithPin(_ pin: String) async throws {
        guard let r = rememberedUser else { throw APIError(status: 0, message: "這台裝置沒有記住使用者") }
        let me: User = try await api.post("/auth/login/pin", PinLoginRequest(user_uid: r.uid, pin: pin))
        await didLogin(me)
    }

    func logout() async {
        try? await api.postVoid("/auth/logout", Empty())
        api.clearCookies()
        ResponseCache.shared.clear()
        UserDefaults.standard.removeObject(forKey: "cacheOwnerUID")
        user = nil
        accounts = []
        categories = []
        icons = []
        await IconImageCache.shared.clear()
        phase = .loggedOut
    }

    func refreshUser() async {
        if let me: User = try? await api.get("/auth/me") { user = me; remember(me) }
    }

    func reloadReferenceData() async {
        async let a: ListResponse<Account> = api.get("/accounts")
        async let c = fetchAll(Category.self, "/categories")
        async let i: IconListResponse = api.get("/icons")
        if let a = try? await a { accounts = a.items }
        if let c = try? await c { categories = c }
        if let i = try? await i { icons = i.items; iconQuota = i.quota }
    }

    func reloadIcons() async {
        if let i: IconListResponse = try? await api.get("/icons") { icons = i.items; iconQuota = i.quota }
    }

    /// The API caps `limit` at 100; keep paging until `total` is reached.
    func fetchAll<T: Decodable>(_: T.Type, _ path: String) async throws -> [T] {
        var items: [T] = []
        while true {
            let page: ListResponse<T> = try await api.get(path, query: ["limit": "100", "offset": String(items.count)])
            items += page.items
            if page.items.isEmpty || items.count >= page.total { return items }
        }
    }

    func didChange() {
        revision += 1
        Task { await reloadReferenceData() }
    }

    func account(_ uid: UUID?) -> Account? { uid.flatMap { accountIndex[$0] } }
    func category(_ uid: UUID?) -> Category? { uid.flatMap { categoryIndex[$0] } }

    private func didLogin(_ me: User) async {
        // the response cache holds one user's ledger; drop it when someone else logs in
        // (no owner yet = fresh install or just logged out, where the cache is already empty)
        let owner = UserDefaults.standard.string(forKey: "cacheOwnerUID")
        if owner != me.user_uid.uuidString {
            if owner != nil { ResponseCache.shared.clear() }
            UserDefaults.standard.set(me.user_uid.uuidString, forKey: "cacheOwnerUID")
        }
        user = me
        remember(me)
        await reloadReferenceData()
        phase = .loggedIn
        startMonitor()
        Task { await syncPending() }
    }

    private func remember(_ me: User) {
        if me.has_pin {
            UserDefaults.standard.set(me.user_uid.uuidString, forKey: "pinUserUID")
            UserDefaults.standard.set(me.email, forKey: "pinUserEmail")
        } else {
            UserDefaults.standard.removeObject(forKey: "pinUserUID")
            UserDefaults.standard.removeObject(forKey: "pinUserEmail")
        }
    }

    private func handleUnauthorized() {
        guard phase == .loggedIn else { return }
        user = nil
        phase = .loggedOut
    }

    // MARK: Offline

    func enqueue(_ payload: PendingWrite.Payload) {
        guard let uid = user?.user_uid else { return }
        pending.append(PendingWrite(id: UUID(), ownerUID: uid, createdAt: Date(), payload: payload))
    }

    func discardPending(_ id: UUID) {
        pending.removeAll { $0.id == id }
    }

    func retryPending(_ id: UUID) async {
        guard let i = pending.firstIndex(where: { $0.id == id }) else { return }
        pending[i].status = .waiting
        pending[i].lastError = nil
        await syncPending()
    }

    /// Cheap reachability check; going back online triggers the upload and a reload.
    func probe() async {
        guard phase == .loggedIn else { return }
        if (try? await api.get("/health") as [String: String]) != nil { await syncPending() }
    }

    /// Sends waiting items in the order they were recorded. Stops at the first sign the server is
    /// still unreachable so nothing is reordered; never resends an item that may already be on the server.
    /// Concurrent callers join the run already in progress.
    func syncPending() async {
        if let running = syncTask { return await running.value }
        let task = Task { await uploadPending() }
        syncTask = task
        await task.value
        syncTask = nil
    }

    private func uploadPending() async {
        guard phase == .loggedIn, let uid = user?.user_uid else { return }
        var sent = 0
        for item in pending where item.ownerUID == uid && item.status == .waiting {
            do {
                switch item.payload {
                case let .transaction(b): try await api.postVoid("/transactions", b)
                case let .transfer(b): try await api.postVoid("/transactions/transfer", b)
                }
                discardPending(item.id)
                sent += 1
            } catch let e as APIError {
                if e.notSent || e.status == 401 || e.status == 429 || [500, 502, 503].contains(e.status) { break }
                // timed out or dropped mid-flight (-1, gateway 504): may have been saved
                let uncertain = e.status == -1 || e.status == 504
                mark(item.id, uncertain ? .uncertain : .failed, e.message)
                if uncertain { break }
            } catch {
                mark(item.id, .failed, error.localizedDescription)
            }
        }
        if sent > 0 {
            didChange()
            showSyncNote("已上傳 \(sent) 筆離線記帳")
        }
    }

    private func mark(_ id: UUID, _ status: PendingWrite.Status, _ message: String) {
        guard let i = pending.firstIndex(where: { $0.id == id }) else { return }
        pending[i].status = status
        pending[i].lastError = message
    }

    private func showSyncNote(_ note: String) {
        syncNote = note
        Task {
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            if syncNote == note { syncNote = nil }
        }
    }

    private func reachability(online: Bool, cachedAt: Date?) {
        if online {
            guard isOffline else { return }
            isOffline = false
            offlineDataAt = nil
            guard phase == .loggedIn else { return }
            // screens loaded from cache while offline: refresh them, then upload
            didChange()
            Task { await syncPending() }
        } else {
            isOffline = true
            if let cachedAt { offlineDataAt = min(offlineDataAt ?? cachedAt, cachedAt) }
        }
    }

    /// While offline or holding unsent items, check back every 30 s (paused with the app).
    private func startMonitor() {
        guard monitor == nil else { return }
        monitor = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                guard let self else { return }
                if self.isOffline || self.myPending.contains(where: { $0.status == .waiting }) {
                    await self.probe()
                }
            }
        }
    }
}
