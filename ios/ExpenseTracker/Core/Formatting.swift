import Foundation

enum DateCoding {
    static let tz = TimeZone(identifier: "Asia/Taipei")!

    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = tz
        return c
    }

    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let output: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        f.timeZone = tz
        return f
    }()

    static func parse(_ s: String) -> Date? {
        withFraction.date(from: s) ?? plain.date(from: s) ?? day(s)
    }

    /// The API rejects naive datetimes, so always send an explicit +08:00 offset.
    static func format(_ date: Date) -> String { output.string(from: date) }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = tz
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func day(_ s: String) -> Date? { dayFormatter.date(from: String(s.prefix(10))) }
    static func dayString(_ d: Date) -> String { dayFormatter.string(from: d) }

    static func display(_ d: Date, _ format: String) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "zh_Hant_TW")
        f.timeZone = tz
        f.dateFormat = format
        return f.string(from: d)
    }

    static func startOfDay(_ d: Date) -> Date { calendar.startOfDay(for: d) }

    static func endOfDay(_ d: Date) -> Date {
        calendar.date(byAdding: DateComponents(day: 1, second: -1), to: startOfDay(d))!
    }

    static func monthRange(containing d: Date) -> (Date, Date) {
        let start = calendar.date(from: calendar.dateComponents([.year, .month], from: d))!
        let next = calendar.date(byAdding: .month, value: 1, to: start)!
        return (start, next.addingTimeInterval(-1))
    }

    static func yearRange(containing d: Date) -> (Date, Date) {
        let start = calendar.date(from: calendar.dateComponents([.year], from: d))!
        let next = calendar.date(byAdding: .year, value: 1, to: start)!
        return (start, next.addingTimeInterval(-1))
    }
}

enum MoneyFormat {
    static func symbol(_ c: Currency) -> String {
        switch c {
        case .TWD: "NT$"
        case .USD: "US$"
        case .JPY: "¥"
        case .EUR: "€"
        case .CNY: "CN¥"
        case .HKD: "HK$"
        case .GBP: "£"
        case .AUD: "A$"
        case .KRW: "₩"
        case .THB: "฿"
        }
    }

    static func number(_ v: Decimal, fraction: Int = 2) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_US")
        f.minimumFractionDigits = fraction
        f.maximumFractionDigits = fraction
        return f.string(from: NSDecimalNumber(decimal: v)) ?? "\(v)"
    }

    static func currency(_ v: Decimal, _ c: Currency = .TWD, fraction: Int = 0, signed: Bool = false) -> String {
        let sign = v < 0 ? "-" : (signed && v > 0 ? "+" : "")
        return sign + symbol(c) + number(abs(v), fraction: fraction)
    }

    static func parse(_ s: String) -> Decimal? {
        let cleaned = s.replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespaces)
        guard !cleaned.isEmpty else { return nil }
        return Decimal(string: cleaned, locale: Locale(identifier: "en_US_POSIX"))
    }

    static func plain(_ v: Decimal) -> String {
        NSDecimalNumber(decimal: v).stringValue
    }
}
