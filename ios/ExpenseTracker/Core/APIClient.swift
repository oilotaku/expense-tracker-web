import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

struct APIError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
    var isUnauthorized: Bool { status == 401 }
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

    func get<T: Decodable>(_ path: String, query: [String: String?] = [:]) async throws -> T {
        try decode(await perform("GET", path, query: query, body: nil))
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

    private func perform(_ method: String, _ path: String, query: [String: String?] = [:], body: Data?) async throws -> Data {
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
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let data: Data
        let resp: URLResponse
        do {
            (data, resp) = try await session.data(for: req)
        } catch {
            throw APIError(status: -1, message: "連不上伺服器：\(error.localizedDescription)")
        }
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let head = try? decoder.decode(EnvelopeHead.self, from: data)
        if !(200..<300).contains(status) || head?.success == false {
            if status == 401, !path.hasPrefix("/auth/") {
                let handler = onUnauthorized
                await MainActor.run { handler?() }
            }
            throw APIError(status: status, message: head?.detail ?? "HTTP \(status)")
        }
        return data
    }
}
