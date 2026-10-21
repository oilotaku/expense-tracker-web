import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

struct QuoteError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// Fetches prices straight from the same public sources the backend uses, so the
/// net-worth card works over the phone's own network without reaching the Pi.
/// Formulas, fallbacks and cache TTLs mirror `backend/app/services/pricing_service.py`.
actor QuoteService {
    static let shared = QuoteService()

    struct Cached: Codable {
        let value: Decimal
        let at: Date
    }

    struct Result {
        let netWorth: NetWorth
        /// Oldest quote used; nil when every quote was fetched just now.
        let staleSince: Date?
    }

    private enum TTL {
        static let stock: TimeInterval = 90
        static let usStock: TimeInterval = 90
        static let metal: TimeInterval = 300
        static let fund: TimeInterval = 600
        static let fx: TimeInterval = 43200
    }

    private static let cacheKey = "quoteCache"
    private static let troyOunceGrams = Decimal(string: "31.1034768")!
    private static let gramsPerTael = Decimal(string: "37.5")!
    private static let macePerTael = Decimal(10)
    private static let metalSymbols = ["黃金": "XAU", "白銀": "XAG"]

    private let session: URLSession
    private var cache: [String: Cached]
    private var staleUsed: Date?

    init() {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 15
        config.httpAdditionalHeaders = ["User-Agent": "expense-tracker-ios/1.0", "Accept": "application/json"]
        session = URLSession(configuration: config)
        if let data = UserDefaults.standard.data(forKey: Self.cacheKey),
           let saved = try? JSONDecoder().decode([String: Cached].self, from: data) {
            cache = saved
        } else {
            cache = [:]
        }
    }

    func clearCache() {
        cache = [:]
        UserDefaults.standard.removeObject(forKey: Self.cacheKey)
    }

    // MARK: - Net worth

    func netWorth(accounts: [Account], assets: [FinancialAsset], liabilities: [Liability]) async throws -> Result {
        staleUsed = nil
        let currencies = Set(accounts.map(\.currency.rawValue)).subtracting(["TWD"]).sorted()
        let stockNames = Array(Set(assets.filter { $0.asset_type == .stock }.map(\.name))).sorted()
        let others = Array(Set(assets.filter { $0.asset_type != .stock }.map { "\($0.asset_type.rawValue)|\($0.name)" })).sorted()

        async let fxTask: [String: Decimal] = fetchAll(currencies) { try await self.rate($0, to: "TWD") }
        async let stockTask: [String: Decimal] = stockPrices(stockNames)
        async let otherTask: [String: Decimal] = fetchAll(others) { key in
            let parts = key.split(separator: "|", maxSplits: 1).map(String.init)
            return try await self.unitPrice(type: AssetType(rawValue: parts[0])!, name: parts[1])
        }
        let fx = try await fxTask
        var prices = try await stockTask
        for (k, v) in try await otherTask { prices[k] = v }

        var total = Decimal(0)
        var accountItems: [NetWorthAccountItem] = []
        for a in accounts {
            if a.currency == .TWD {
                total += a.balance.value
            } else {
                guard let r = fx[a.currency.rawValue] else { throw QuoteError(message: "缺少 \(a.currency.rawValue) 匯率") }
                let converted = a.balance.value * r
                total += converted
                accountItems.append(NetWorthAccountItem(account_uid: a.account_uid, converted_balance: Money(Self.round(converted, 2))))
            }
        }
        var assetItems: [NetWorthAssetItem] = []
        for asset in assets {
            let key = asset.asset_type == .stock ? asset.name : "\(asset.asset_type.rawValue)|\(asset.name)"
            guard let price = prices[key] else { throw QuoteError(message: "缺少 \(asset.name) 報價") }
            let mv = Self.round(asset.base_quantity.value * price, 2)
            total += mv
            assetItems.append(NetWorthAssetItem(
                financial_asset_uid: asset.financial_asset_uid, asset_type: asset.asset_type, name: asset.name,
                market_value: Money(mv), principal_amount: asset.principal_amount,
                gain_percent: Self.gainPercent(mv, asset.principal_amount?.value).map(Money.init)))
        }
        let totalLiabilities = Self.round(liabilities.reduce(Decimal(0)) { $0 + $1.amount.value }, 2)
        let totalAssets = Self.round(total, 2)
        let nw = NetWorth(total_assets: Money(totalAssets), total_liabilities: Money(totalLiabilities),
                          net_worth: Money(Self.round(totalAssets - totalLiabilities, 2)),
                          assets: assetItems, accounts: accountItems)
        persist()
        return Result(netWorth: nw, staleSince: staleUsed)
    }

    private static func gainPercent(_ marketValue: Decimal, _ principal: Decimal?) -> Decimal? {
        guard let p = principal, p != 0 else { return nil }
        return round((marketValue - p) / p * 100, 2)
    }

    private static func round(_ v: Decimal, _ scale: Int) -> Decimal {
        var input = v
        var out = Decimal()
        NSDecimalRound(&out, &input, scale, .plain)
        return out
    }

    // MARK: - Per-source prices (TWD per base unit)

    private func unitPrice(type: AssetType, name: String) async throws -> Decimal {
        switch type {
        case .stock:
            return try await stockPrices([name])[name] ?? { throw QuoteError(message: "查無股號 \(name)") }()
        case .us_stock:
            return try await cached("us:\(name)", ttl: TTL.usStock) {
                let usd = try await self.yahooPrice(name)
                return usd * (try await self.rate("USD", to: "TWD"))
            }
        case .fund:
            return try await cached("fund:\(name)", ttl: TTL.fund) {
                let (nav, currency) = try await self.cnyesNav(name)
                return currency == "TWD" ? nav : nav * (try await self.rate(currency, to: "TWD"))
            }
        case .metal:
            guard let symbol = Self.metalSymbols[name] else { throw QuoteError(message: "不支援的貴金屬品項：\(name)") }
            let perOunceUSD = try await cached("metal:\(symbol)", ttl: TTL.metal) { try await self.goldPrice(symbol) }
            let usdTwd = try await rate("USD", to: "TWD")
            return perOunceUSD / Self.troyOunceGrams * usdTwd * Self.gramsPerTael / Self.macePerTael
        }
    }

    func rate(_ base: String, to quote: String) async throws -> Decimal {
        if base == quote { return 1 }
        return try await cached("fx:\(base):\(quote)", ttl: TTL.fx) {
            let json = try await self.getJSON("https://open.er-api.com/v6/latest/\(base)", label: "匯率服務")
            guard let rates = json["rates"] as? [String: Any], let r = Self.decimal(rates[quote]) else {
                throw QuoteError(message: "匯率服務回應缺少 \(quote)")
            }
            return r
        }
    }

    /// TWSE MIS batch quote: try listed (`tse_`) first, then OTC for the ones still missing.
    func stockPrices(_ tickers: [String]) async throws -> [String: Decimal] {
        var result: [String: Decimal] = [:]
        var misses: [String] = []
        for t in tickers {
            if let c = cache["stock:\(t)"], Date().timeIntervalSince(c.at) < TTL.stock { result[t] = c.value } else { misses.append(t) }
        }
        guard !misses.isEmpty else { return result }
        do {
            var fetched = try await twseBatch(misses, market: "tse")
            let still = misses.filter { fetched[$0] == nil }
            if !still.isEmpty {
                for (k, v) in try await twseBatch(still, market: "otc") { fetched[k] = v }
            }
            if let missing = misses.first(where: { fetched[$0] == nil }) {
                throw QuoteError(message: "查無股號 \(missing) 的報價")
            }
            for (k, v) in fetched {
                cache["stock:\(k)"] = Cached(value: v, at: Date())
                result[k] = v
            }
            return result
        } catch {
            // offline or source down: fall back to whatever we last saw
            for t in misses {
                guard let c = cache["stock:\(t)"] else { throw error }
                result[t] = c.value
                noteStale(c.at)
            }
            return result
        }
    }

    private func twseBatch(_ tickers: [String], market: String) async throws -> [String: Decimal] {
        let exCh = tickers.map { "\(market)_\($0).tw" }.joined(separator: "|")
        var comps = URLComponents(string: "https://mis.twse.com.tw/stock/api/getStockInfo.jsp")!
        comps.queryItems = [URLQueryItem(name: "ex_ch", value: exCh), URLQueryItem(name: "json", value: "1"), URLQueryItem(name: "delay", value: "0")]
        // the endpoint answers text/html with a JSON body, so parse the bytes regardless of content type
        let json = try await getJSON(comps.url!.absoluteString, label: "證交所報價服務")
        guard let rows = json["msgArray"] as? [[String: Any]], rows.count == tickers.count else {
            throw QuoteError(message: "證交所報價服務回應格式異常")
        }
        var out: [String: Decimal] = [:]
        for (ticker, row) in zip(tickers, rows) {
            guard let code = row["c"] as? String, !code.isEmpty else { continue }
            var raw = row["z"] as? String
            if raw == nil || raw == "-" || raw == "" {
                raw = Self.firstPositiveLevel(row["a"]) ?? Self.firstPositiveLevel(row["b"]) ?? Self.firstPositiveLevel(row["y"])
            }
            guard let r = raw, let price = Self.decimal(r), price > 0 else {
                throw QuoteError(message: "股號 \(ticker) 目前無可用報價")
            }
            out[ticker] = price
        }
        return out
    }

    /// `"-"` (no orders) and `0.0000` (limit-up/down market-order placeholder) are skipped.
    private static func firstPositiveLevel(_ field: Any?) -> String? {
        guard let s = field as? String else { return nil }
        for level in s.split(separator: "_") {
            if let d = decimal(String(level)), d > 0 { return String(level) }
        }
        return nil
    }

    private func yahooPrice(_ ticker: String) async throws -> Decimal {
        let json = try await getJSON("https://query1.finance.yahoo.com/v8/finance/chart/\(ticker)", label: "美股報價服務")
        guard let chart = json["chart"] as? [String: Any],
              let result = (chart["result"] as? [[String: Any]])?.first,
              let meta = result["meta"] as? [String: Any],
              let price = Self.decimal(meta["regularMarketPrice"]) else {
            throw QuoteError(message: "查無美股代號 \(ticker) 的報價")
        }
        return price
    }

    private func cnyesNav(_ fundID: String) async throws -> (Decimal, String) {
        // the id must stay verbatim (offshore funds contain a comma)
        let json = try await getJSON("https://fund.api.cnyes.com/fund/api/v1/funds/\(fundID)/nav", label: "基金淨值服務")
        guard let items = json["items"] as? [String: Any],
              let navs = items["nav"] as? [Any], let nav = Self.decimal(navs.first),
              let currency = items["classCurrency"] as? String else {
            throw QuoteError(message: "查無基金代號 \(fundID) 的淨值")
        }
        return (nav, currency.uppercased())
    }

    private func goldPrice(_ symbol: String) async throws -> Decimal {
        let json = try await getJSON("https://api.gold-api.com/price/\(symbol)", label: "貴金屬報價服務")
        guard let price = Self.decimal(json["price"]) else { throw QuoteError(message: "貴金屬報價服務回應格式異常") }
        return price
    }

    // MARK: - Helpers

    private func cached(_ key: String, ttl: TimeInterval, fetch: () async throws -> Decimal) async throws -> Decimal {
        if let c = cache[key], Date().timeIntervalSince(c.at) < ttl { return c.value }
        do {
            let v = try await fetch()
            cache[key] = Cached(value: v, at: Date())
            return v
        } catch {
            guard let c = cache[key] else { throw error }
            noteStale(c.at)
            return c.value
        }
    }

    private func fetchAll(_ keys: [String], _ op: @escaping (String) async throws -> Decimal) async throws -> [String: Decimal] {
        try await withThrowingTaskGroup(of: (String, Decimal).self, returning: [String: Decimal].self) { group in
            for k in keys { group.addTask { (k, try await op(k)) } }
            var out: [String: Decimal] = [:]
            for try await (k, v) in group { out[k] = v }
            return out
        }
    }

    private func noteStale(_ at: Date) {
        staleUsed = min(staleUsed ?? at, at)
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(cache) { UserDefaults.standard.set(data, forKey: Self.cacheKey) }
    }

    private func getJSON(_ urlString: String, label: String) async throws -> [String: Any] {
        guard let url = URL(string: urlString) else { throw QuoteError(message: "\(label)網址錯誤") }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(from: url)
        } catch {
            throw QuoteError(message: "\(label)連線失敗")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 404 { throw QuoteError(message: "\(label)查無資料") }
        if status == 429 { throw QuoteError(message: "\(label)暫時限流") }
        guard (200..<300).contains(status) else { throw QuoteError(message: "\(label)錯誤：\(status)") }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw QuoteError(message: "\(label)回應格式異常")
        }
        return json
    }

    private static func decimal(_ v: Any?) -> Decimal? {
        switch v {
        case let s as String: return Decimal(string: s, locale: Locale(identifier: "en_US_POSIX"))
        case let n as NSNumber: return Decimal(string: n.stringValue, locale: Locale(identifier: "en_US_POSIX"))
        default: return nil
        }
    }
}
