import Foundation
import Observation

@MainActor
@Observable
final class AppState {
    enum Phase { case launching, needsServer, loggedOut, loggedIn }

    var phase: Phase = .launching
    var user: User?
    var accounts: [Account] = [] { didSet { accountIndex = Dictionary(uniqueKeysWithValues: accounts.map { ($0.account_uid, $0) }) } }
    var categories: [Category] = [] { didSet { categoryIndex = Dictionary(uniqueKeysWithValues: categories.map { ($0.category_uid, $0) }) } }
    private var accountIndex: [UUID: Account] = [:]
    private var categoryIndex: [UUID: Category] = [:]
    /// Bumped after any write so list screens know to reload.
    var revision = 0

    private let api = APIClient.shared

    init() {
        api.onUnauthorized = { [weak self] in self?.handleUnauthorized() }
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
            await didLogin(me)
        } catch {
            phase = .loggedOut
        }
    }

    func login(email: String, password: String) async throws {
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
        user = nil
        accounts = []
        categories = []
        phase = .loggedOut
    }

    func refreshUser() async {
        if let me: User = try? await api.get("/auth/me") { user = me; remember(me) }
    }

    func reloadReferenceData() async {
        async let a: ListResponse<Account> = api.get("/accounts")
        async let c: ListResponse<Category> = api.get("/categories", query: ["limit": "100"])
        if let a = try? await a { accounts = a.items }
        if let c = try? await c { categories = c.items }
    }

    func didChange() {
        revision += 1
        Task { await reloadReferenceData() }
    }

    func account(_ uid: UUID?) -> Account? { uid.flatMap { accountIndex[$0] } }
    func category(_ uid: UUID?) -> Category? { uid.flatMap { categoryIndex[$0] } }

    private func didLogin(_ me: User) async {
        user = me
        remember(me)
        await reloadReferenceData()
        phase = .loggedIn
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
}
