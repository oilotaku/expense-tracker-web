import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

struct APIError: LocalizedError {
    let status: Int
    let message: String
    /// The request never left the phone (no network, DNS/Tailscale down, refused): safe to send again later.
    var notSent = false
    var errorDescription: String? { message }
    var isUnauthorized: Bool { status == 401 }
    /// Transport failure or the web proxy couldn't reach the backend.
    var isUnreachable: Bool { status == -1 || (502...504).contains(status) }
}

/// Talks to the web app's same-origin `/api/v1` proxy; auth rides on the HttpOnly
/// `access_token` cookie, which URLSession keeps in the shared cookie storage.
final class APIClient {
    static let shared = APIClient()

    var baseURL: URL? {
        guard let raw = UserDefaults.standard.string(forKey: "serverURL"), !raw.isEmpty else { return nil }
        return URL(string: raw.trimmingCharacters(in: CharacterSet(charactersIn: "/ ")))
    }

    var onUnauthorized: (() -> Void)?
    /// Called after every request: reachable or not, and when a cached copy was served instead, how old it is.
    var onReachability: ((_ online: Bool, _ cachedAt: Date?) -> Void)?

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        config.timeoutIntervalForRequest = 20
        session = URLSession(configuration: config)

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { d in
            let c = try d.singleValueContainer()
            let s = try c.decode(String.self)
            if let date = DateCoding.parse(s) { return date }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "bad date \(s)")
        }
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, e in
            var c = e.singleValueContainer()
            try c.encode(DateCoding.format(date))
        }
    }

    /// Successful GETs are kept on disk; when the server can't be reached the last copy is returned instead.
    func get<T: Decodable>(_ path: String, query: [String: String?] = [:]) async throws -> T {
        let cacheable = !path.hasPrefix("/health")
        let key = "GET \(path)?" + query.compactMap { k, v in v.map { "\(k)=\($0)" } }.sorted().joined(separator: "&")
        do {
            let data = try await perform("GET", path, query: query, body: nil)
            let value: T = try decode(data)
            if cacheable { ResponseCache.shared.store(data, for: key) }
            return value
        } catch let e as APIError where e.isUnreachable && cacheable {
            guard let hit = ResponseCache.shared.load(key), let value: T = try? decode(hit.data) else { throw e }
            await report(online: false, cachedAt: hit.savedAt)
            return value
        }
    }

    func post<T: Decodable, B: Encodable>(_ path: String, _ body: B) async throws -> T {
        try decode(await perform("POST", path, body: try encoder.encode(body)))
    }

    func patch<T: Decodable, B: Encodable>(_ path: String, _ body: B) async throws -> T {
        try decode(await perform("PATCH", path, body: try encoder.encode(body)))
    }

    func postVoid<B: Encodable>(_ path: String, _ body: B) async throws {
        _ = try await perform("POST", path, body: try encoder.encode(body))
    }

    func patchVoid<B: Encodable>(_ path: String, _ body: B) async throws {
        _ = try await perform("PATCH", path, body: try encoder.encode(body))
    }

    func delete(_ path: String) async throws {
        _ = try await perform("DELETE", path, body: nil)
    }

    func delete<B: Encodable>(_ path: String, _ body: B) async throws {
        _ = try await perform("DELETE", path, body: try encoder.encode(body))
    }

    /// Raw bytes (e.g. an icon PNG). Not cached here; callers keep their own cache.
    func getData(_ path: String) async throws -> Data {
        try await perform("GET", path, body: nil, accept: "image/png")
    }

    /// multipart/form-data upload; returns the raw response body.
    func postMultipartData(_ path: String, fileData: Data, fileName: String, mimeType: String,
                           fields: [String: String]) async throws -> Data {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        func line(_ s: String) { body.append(Data((s + "\r\n").utf8)) }
        for (name, value) in fields.sorted(by: { $0.key < $1.key }) {
            line("--\(boundary)")
            line("Content-Disposition: form-data; name=\"\(name)\"")
            line("")
            line(value)
        }
        line("--\(boundary)")
        line("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"")
        line("Content-Type: \(mimeType)")
        line("")
        body.append(fileData)
        line("")
        line("--\(boundary)--")
        return try await perform("POST", path, body: body, contentType: "multipart/form-data; boundary=\(boundary)",
                                 accept: "image/png, application/json")
    }

    func postMultipart<T: Decodable>(_ path: String, fileData: Data, fileName: String, mimeType: String,
                                     fields: [String: String]) async throws -> T {
        try decode(await postMultipartData(path, fileData: fileData, fileName: fileName, mimeType: mimeType, fields: fields))
    }

    func clearCookies() {
        HTTPCookieStorage.shared.cookies?.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
    }

    private struct EnvelopeHead: Decodable {
        let success: Bool?
        let detail: String?
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do {
            if let value = try decoder.decode(APIEnvelope<T>.self, from: data).data { return value }
            throw APIError(status: 200, message: "回應沒有資料")
        } catch let e as APIError {
            throw e
        } catch {
            throw APIError(status: 200, message: "回應格式錯誤：\(error)")
        }
    }

    private func perform(_ method: String, _ path: String, query: [String: String?] = [:], body: Data?,
                         contentType: String = "application/json", accept: String = "application/json") async throws -> Data {
        guard let base = baseURL else { throw APIError(status: 0, message: "尚未設定伺服器位址") }
        var comps = URLComponents(url: base.appendingPathComponent("api/v1" + path), resolvingAgainstBaseURL: false)!
        let items = query.compactMap { k, v in v.map { URLQueryItem(name: k, value: $0) } }
        if !items.isEmpty {
            comps.queryItems = items
            // `+` in timezone offsets must not be read as a space by the server.
            comps.percentEncodedQuery = comps.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        }
        var req = URLRequest(url: comps.url!)
        req.httpMethod = method
        req.setValue(accept, forHTTPHeaderField: "Accept")
        if let body {
            req.httpBody = body
            req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }

        let data: Data
        let resp: URLResponse
        do {
            (data, resp) = try await session.data(for: req)
        } catch let e as URLError where e.code == .cancelled {
            throw APIError(status: -2, message: "已取消")
        } catch {
            let notSent = (error as? URLError).map { Self.notSentCodes.contains($0.code) } ?? false
            await report(online: false)
            throw APIError(status: -1, message: "連不上伺服器：\(error.localizedDescription)", notSent: notSent)
        }
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        await report(online: !(502...504).contains(status))
        // Binary bodies (icon PNGs) aren't JSON envelopes; only sniff JSON for success/detail.
        let isJSON = ((resp as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type") ?? "").contains("json")
        let head = isJSON ? try? decoder.decode(EnvelopeHead.self, from: data) : nil
        if !(200..<300).contains(status) || head?.success == false {
            if status == 401, !path.hasPrefix("/auth/") {
                let handler = onUnauthorized
                await MainActor.run { handler?() }
            }
            throw APIError(status: status, message: head?.detail ?? "HTTP \(status)")
        }
        return data
    }

    /// Failures that happen before any byte of the request reaches the server.
    /// Timeouts and dropped connections are excluded: the server may have acted on those.
    private static let notSentCodes: Set<URLError.Code> = [
        .notConnectedToInternet, .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed,
        .dataNotAllowed, .internationalRoamingOff, .secureConnectionFailed,
    ]

    private func report(online: Bool, cachedAt: Date? = nil) async {
        let handler = onReachability
        await MainActor.run { handler?(online, cachedAt) }
    }
}
