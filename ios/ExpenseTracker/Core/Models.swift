import Foundation

/// Pydantic serializes Decimal as a JSON string; accept numbers too.
struct Money: Codable, Hashable, Comparable {
    var value: Decimal

    init(_ value: Decimal) { self.value = value }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self), let d = Decimal(string: s, locale: Locale(identifier: "en_US_POSIX")) {
            value = d
        } else if let d = try? c.decode(Double.self) {
            value = Decimal(d)
        } else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "invalid decimal")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(NSDecimalNumber(decimal: value).stringValue)
    }

    var double: Double { NSDecimalNumber(decimal: value).doubleValue }

    static func < (a: Money, b: Money) -> Bool { a.value < b.value }
    static let zero = Money(0)
}

struct APIEnvelope<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let detail: String?
}

struct Empty: Codable {}

enum TransactionType: String, Codable, CaseIterable, Identifiable {
    case income, expense, transfer
    var id: String { rawValue }
    var label: String {
        switch self {
        case .income: "收入"
        case .expense: "支出"
        case .transfer: "轉帳"
        }
    }
}

enum Currency: String, Codable, CaseIterable, Identifiable {
    case TWD, USD, JPY, EUR, CNY, HKD, GBP, AUD, KRW, THB
    var id: String { rawValue }
}

// MARK: - Auth

struct User: Codable, Hashable {
    let user_uid: UUID
    let email: String
    let has_pin: Bool
    let is_admin: Bool
    let must_change_password: Bool
}

struct LoginRequest: Encodable { let email: String; let password: String }
struct PinLoginRequest: Encodable { let user_uid: UUID; let pin: String }
struct ChangePasswordRequest: Encodable { let current_password: String; let new_password: String }
struct SetPinRequest: Encodable { let pin: String; let password: String }
struct ChangePinRequest: Encodable { let current_pin: String; let new_pin: String }
struct DisablePinRequest: Encodable { let password: String }

// MARK: - Accounts

struct ListResponse<T: Decodable>: Decodable {
    let items: [T]
    let total: Int
}

struct Account: Codable, Hashable, Identifiable {
    let account_uid: UUID
    var name: String
    var balance: Money
    var currency: Currency
    var color: String
    var icon: String
    var id: UUID { account_uid }
}

struct AccountCreateRequest: Encodable {
    let name: String
    let balance: Money
    let currency: Currency
    let color: String
    let icon: String
}

struct AccountUpdateRequest: Encodable {
    var name: String?
    var balance: Money?
    var color: String?
    var icon: String?
}

// MARK: - Categories

struct Category: Codable, Hashable, Identifiable {
    let category_uid: UUID
    var name: String
    var color: String
    var icon: String
    var id: UUID { category_uid }
}

struct CategoryWrite: Encodable {
    let name: String
    let color: String
    let icon: String
}

// MARK: - Transactions

struct Tag: Codable, Hashable {
    let tag_uid: UUID
    let name: String
}

enum TransferDirection: String, Codable { case out, `in` }

struct Transaction: Codable, Hashable, Identifiable {
    let transaction_uid: UUID
    let account_uid: UUID
    let category_uid: UUID?
    let transaction_date: Date
    let description: String
    let amount: Money
    let transaction_type: TransactionType
    let payment_method: String
    let tags: [Tag]
    let transfer_group_uid: UUID?
    let transfer_direction: TransferDirection?
    let transfer_counterpart_account_uid: UUID?
    var id: UUID { transaction_uid }
}

struct TransactionWrite: Codable, Hashable {
    let account_uid: UUID
    let category_uid: UUID
    let transaction_date: Date
    let description: String
    let amount: Money
    let transaction_type: TransactionType
    let payment_method: String
    var tags: [String]? = nil
}

struct TransferWrite: Codable, Hashable {
    let from_account_uid: UUID
    let to_account_uid: UUID
    let transaction_date: Date
    let description: String
    let amount: Money
    let payment_method: String
}

struct TransferResponse: Decodable {
    let outbound: Transaction
    let inbound: Transaction
}

// MARK: - Budgets

enum BudgetPeriod: String, Codable, CaseIterable, Identifiable {
    case monthly, daily
    var id: String { rawValue }
    var label: String { self == .monthly ? "每月" : "每日" }
}

struct Budget: Codable, Hashable, Identifiable {
    let budget_uid: UUID
    let category_uid: UUID
    let period_type: BudgetPeriod
    let limit_amount: Money
    var id: UUID { budget_uid }
}

struct BudgetSummary: Codable, Hashable {
    let budget_uid: UUID
    let category_uid: UUID
    let period_type: BudgetPeriod
    let limit_amount: Money
    let spent_amount: Money
    let remaining_amount: Money
    let is_over_budget: Bool
}

struct BudgetCreateRequest: Encodable {
    let category_uid: UUID
    let period_type: BudgetPeriod
    let limit_amount: Money
}

struct BudgetUpdateRequest: Encodable { let limit_amount: Money }

// MARK: - Assets & liabilities

enum AssetType: String, Codable, CaseIterable, Identifiable {
    case stock, us_stock, metal, fund
    var id: String { rawValue }
}

struct FinancialAsset: Codable, Hashable, Identifiable {
    let financial_asset_uid: UUID
    let asset_type: AssetType
    let name: String
    let input_quantity: Money
    let input_unit: String
    let base_quantity: Money
    let principal_amount: Money?
    var id: UUID { financial_asset_uid }
}

struct FinancialAssetCreateRequest: Encodable {
    let asset_type: AssetType
    let name: String
    let input_quantity: Money
    let input_unit: String
    let principal_amount: Money
}

struct FinancialAssetUpdateRequest: Encodable {
    let name: String
    let input_quantity: Money
    let input_unit: String
    let principal_amount: Money?
}

struct Liability: Codable, Hashable, Identifiable {
    let liability_uid: UUID
    let name: String
    let amount: Money
    let interest_rate: Money?
    var id: UUID { liability_uid }
}

struct LiabilityWrite: Encodable {
    let name: String
    let amount: Money
    let interest_rate: Money?
}

struct LiabilityRepayRequest: Encodable {
    let amount: Money
    let account_uid: UUID
    let category_uid: UUID
    let payment_method: String
}

struct NetWorthAccountItem: Codable, Hashable {
    let account_uid: UUID
    let converted_balance: Money
}

struct NetWorthAssetItem: Codable, Hashable {
    let financial_asset_uid: UUID
    let asset_type: AssetType
    let name: String
    let market_value: Money
    let principal_amount: Money?
    let gain_percent: Money?
}

struct NetWorth: Codable, Hashable {
    let total_assets: Money
    let total_liabilities: Money
    let net_worth: Money
    let assets: [NetWorthAssetItem]
    let accounts: [NetWorthAccountItem]
}

// MARK: - Recurring

enum IntervalUnit: String, Codable, CaseIterable, Identifiable {
    case week, month, year
    var id: String { rawValue }
    var label: String {
        switch self {
        case .week: "週"
        case .month: "月"
        case .year: "年"
        }
    }
}

struct RecurringRule: Codable, Hashable, Identifiable {
    let recurring_rule_uid: UUID
    let account_uid: UUID
    let category_uid: UUID
    let description: String
    let amount: Money
    let transaction_type: TransactionType
    let payment_method: String
    let interval_unit: IntervalUnit
    let interval_count: Int
    let anchor_date: String
    let last_generated_year_month: String?
    let liability_uid: UUID?
    let is_active: Bool
    var id: UUID { recurring_rule_uid }
}

struct RecurringRuleWrite: Encodable {
    let account_uid: UUID
    let category_uid: UUID
    let description: String
    let amount: Money
    let transaction_type: TransactionType
    let payment_method: String
    let interval_unit: IntervalUnit
    let interval_count: Int
    let anchor_date: String
    let liability_uid: UUID?
}

struct RecurringRuleActiveUpdate: Encodable { let is_active: Bool }

// MARK: - Dashboard

struct DashboardSummary: Codable, Hashable {
    let period: String
    let income: Money
    let expense: Money
    let balance: Money
    let budget_remaining: Money?
}

struct CategoryBreakdownItem: Codable, Hashable {
    let category_uid: UUID
    let amount: Money
}

struct TrendPoint: Codable, Hashable {
    let date: String
    let income: Money
    let expense: Money
}

struct ItemsResponse<T: Decodable>: Decodable { let items: [T] }

// MARK: - Custom icons (ADR-0006)

struct UserIcon: Codable, Hashable, Identifiable {
    let user_icon_uid: UUID
    /// Value written into an account / category `icon` field: `custom:<uid>`.
    let icon_key: String
    let content_sha256: String
    let byte_size: Int
    let usage_count: Int
    let created_at: Date
    var id: UUID { user_icon_uid }
}

struct IconQuota: Codable, Hashable {
    let used: Int
    let limit: Int
}

struct IconListResponse: Codable {
    let items: [UserIcon]
    let quota: IconQuota
}

struct IconUsages: Codable {
    struct AccountRef: Codable, Hashable { let account_uid: UUID; let name: String }
    struct CategoryRef: Codable, Hashable { let category_uid: UUID; let name: String }
    let accounts: [AccountRef]
    let categories: [CategoryRef]
}

struct IconDeleteResult: Codable {
    let reset_accounts: Int
    let reset_categories: Int
}
