import Charts
import SwiftUI

enum DashboardPeriod: String, CaseIterable, Identifiable {
    case month, year, custom
    var id: String { rawValue }
    var label: String {
        switch self {
        case .month: "月"
        case .year: "年"
        case .custom: "自訂"
        }
    }
}

struct DashboardView: View {
    @Environment(AppState.self) private var state
    @AppStorage("chartType") private var chartType = "pie"

    @State private var period: DashboardPeriod = .month
    @State private var anchor = Date()
    @State private var customFrom = DateCoding.monthRange(containing: Date()).0
    @State private var customTo = Date()

    @State private var summary: DashboardSummary?
    @State private var breakdown: [CategoryBreakdownItem] = []
    @State private var trend: [TrendPoint] = []
    @State private var netWorth: NetWorth?
    @State private var netWorthError: String?
    @State private var recent: [Transaction] = []
    @State private var error: String?

    private var range: (Date, Date) {
        switch period {
        case .month: DateCoding.monthRange(containing: anchor)
        case .year: DateCoding.yearRange(containing: anchor)
        case .custom: (DateCoding.startOfDay(customFrom), DateCoding.endOfDay(customTo))
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                periodBar
                ErrorBanner(message: error)
                statTiles
                chartCard
                netWorthCard
                recentCard
            }
            .padding(16)
        }
        .screenBackground()
        .navigationTitle("總覽")
        .refreshable { await load() }
        .task(id: "\(period.rawValue)\(range.0)\(range.1)\(state.revision)") { await load() }
    }

    // MARK: Period

    private var periodBar: some View {
        VStack(spacing: 10) {
            Picker("期間", selection: $period) {
                ForEach(DashboardPeriod.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)

            switch period {
            case .month, .year:
                HStack {
                    Button { shift(-1) } label: { Image(systemName: "chevron.left") }
                    Spacer()
                    Text(DateCoding.display(anchor, period == .month ? "yyyy 年 M 月" : "yyyy 年"))
                        .font(.headline)
                    Spacer()
                    Button { shift(1) } label: { Image(systemName: "chevron.right") }
                }
                .padding(.horizontal, 8)
            case .custom:
                HStack {
                    DatePicker("", selection: $customFrom, displayedComponents: .date).labelsHidden()
                    Text("至")
                    DatePicker("", selection: $customTo, in: customFrom..., displayedComponents: .date).labelsHidden()
                }
            }
        }
    }

    private func shift(_ n: Int) {
        anchor = DateCoding.calendar.date(byAdding: period == .month ? .month : .year, value: n, to: anchor) ?? anchor
    }

    // MARK: Tiles

    private var statTiles: some View {
        VStack(spacing: 12) {
            Card {
                VStack(alignment: .leading, spacing: 6) {
                    FieldLabel(text: "結餘")
                    Text(MoneyFormat.currency(summary?.balance.value ?? 0, signed: true))
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .foregroundStyle(Theme.textPrimary)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                }
            }
            HStack(spacing: 12) {
                tile("收入", summary?.income.value, Theme.income)
                tile("支出", summary?.expense.value, Theme.expense)
            }
            Card {
                VStack(alignment: .leading, spacing: 6) {
                    FieldLabel(text: "預算結餘")
                    if period == .custom || summary?.budget_remaining == nil {
                        Text("—").font(.title2.bold()).foregroundStyle(Theme.textMuted)
                        Text("預算僅支援月／年度檢視").font(.caption).foregroundStyle(Theme.textMuted)
                    } else {
                        Text(MoneyFormat.currency(summary?.budget_remaining?.value ?? 0))
                            .font(.title2.bold()).foregroundStyle(Theme.warning)
                    }
                }
            }
        }
    }

    private func tile(_ label: String, _ value: Decimal?, _ color: Color) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 6) {
                FieldLabel(text: label)
                Text(MoneyFormat.currency(value ?? 0))
                    .font(.title3.bold())
                    .foregroundStyle(color)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            }
        }
    }

    // MARK: Charts

    private struct Slice: Identifiable {
        let id: String
        let name: String
        let amount: Double
        let color: String
    }

    /// Top 6 by amount, the rest folded into 「其他」; colors follow rank, not the category color.
    private var slices: [Slice] {
        let sorted = breakdown.sorted { $0.amount > $1.amount }.filter { $0.amount.value > 0 }
        var result = sorted.prefix(6).enumerated().map { i, item in
            Slice(id: item.category_uid.uuidString,
                  name: state.category(item.category_uid)?.name ?? "未分類",
                  amount: item.amount.double,
                  color: Theme.palette[i % Theme.palette.count])
        }
        if sorted.count > 6 {
            let rest = sorted.dropFirst(6).reduce(0.0) { $0 + $1.amount.double }
            result.append(Slice(id: "other", name: "其他", amount: rest, color: Theme.chartOther))
        }
        return result
    }

    private var chartCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(chartType == "line" ? "收支趨勢" : "支出分類").font(.headline)
                    Spacer()
                    Picker("", selection: $chartType) {
                        Image(systemName: "chart.pie").tag("pie")
                        Image(systemName: "chart.bar").tag("bar")
                        Image(systemName: "chart.xyaxis.line").tag("line")
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 150)
                }
                switch chartType {
                case "line": trendChart
                case "bar": barChart
                default: pieChart
                }
            }
        }
    }

    @ViewBuilder private var pieChart: some View {
        let data = slices
        if data.isEmpty {
            emptyChart("這段期間沒有支出")
        } else {
            let total = data.reduce(0) { $0 + $1.amount }
            HStack(alignment: .center, spacing: 16) {
                Chart(data) { s in
                    SectorMark(angle: .value("金額", s.amount), innerRadius: .ratio(0.55), angularInset: 1.5)
                        .foregroundStyle(Color(hex: s.color))
                        .cornerRadius(3)
                }
                .frame(width: 150, height: 150)
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(data) { s in
                        HStack(spacing: 6) {
                            ColorDot(hex: s.color)
                            Text(s.name).font(.caption).lineLimit(1)
                            Spacer(minLength: 4)
                            Text(String(format: "%.0f%%", s.amount / total * 100))
                                .font(.caption.monospacedDigit()).foregroundStyle(Theme.textSecondary)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private var barChart: some View {
        let data = slices
        if data.isEmpty {
            emptyChart("這段期間沒有支出")
        } else {
            Chart(data) { s in
                BarMark(x: .value("金額", s.amount), y: .value("分類", s.name))
                    .foregroundStyle(Color(hex: s.color))
                    .cornerRadius(4)
                    .annotation(position: .trailing) {
                        Text(MoneyFormat.currency(Decimal(s.amount))).font(.caption2).foregroundStyle(Theme.textSecondary)
                    }
            }
            .chartXAxis(.hidden)
            .frame(height: CGFloat(data.count) * 34 + 10)
        }
    }

    @ViewBuilder private var trendChart: some View {
        if trend.isEmpty {
            emptyChart("尚無趨勢資料")
        } else {
            Chart {
                ForEach(trend, id: \.date) { p in
                    LineMark(x: .value("日期", DateCoding.day(p.date) ?? Date()), y: .value("金額", p.income.double), series: .value("類型", "收入"))
                        .foregroundStyle(Theme.income)
                        .interpolationMethod(.monotone)
                    LineMark(x: .value("日期", DateCoding.day(p.date) ?? Date()), y: .value("金額", p.expense.double), series: .value("類型", "支出"))
                        .foregroundStyle(Theme.expense)
                        .interpolationMethod(.monotone)
                }
            }
            .frame(height: 220)
            HStack(spacing: 16) {
                HStack(spacing: 4) { ColorDot(hex: "#2f7d49"); Text("收入").font(.caption) }
                HStack(spacing: 4) { ColorDot(hex: "#c14b42"); Text("支出").font(.caption) }
            }
        }
    }

    private func emptyChart(_ text: String) -> some View {
        Text(text).font(.subheadline).foregroundStyle(Theme.textMuted)
            .frame(maxWidth: .infinity, minHeight: 120)
    }

    // MARK: Net worth

    private var netWorthCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("帳戶總覽").font(.headline)
                ForEach(state.accounts.prefix(4)) { a in
                    HStack {
                        ColorDot(hex: a.color)
                        Text(a.name)
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(MoneyFormat.number(a.balance.value)) \(a.currency.rawValue)")
                                .font(.subheadline.monospacedDigit())
                            if a.currency != .TWD,
                               let c = netWorth?.accounts.first(where: { $0.account_uid == a.account_uid }) {
                                Text("≈ \(MoneyFormat.currency(c.converted_balance.value))")
                                    .font(.caption).foregroundStyle(Theme.textMuted)
                            }
                        }
                    }
                }
                if state.accounts.count > 4 {
                    Text("另有 \(state.accounts.count - 4) 個帳戶未顯示").font(.caption).foregroundStyle(Theme.textMuted)
                }

                if let netWorthError {
                    Divider()
                    Text(netWorthError).font(.footnote).foregroundStyle(Theme.warning)
                    Button("重試") { Task { await loadNetWorth() } }.font(.footnote)
                } else if let nw = netWorth {
                    if !nw.assets.isEmpty {
                        Divider()
                        Text("浮動資產").font(.subheadline.bold())
                        ForEach(nw.assets, id: \.financial_asset_uid) { a in
                            HStack {
                                Text(a.name).font(.subheadline)
                                Spacer()
                                Text(MoneyFormat.currency(a.market_value.value)).font(.subheadline.monospacedDigit())
                                GainBadge(percent: a.gain_percent?.value)
                            }
                        }
                        HStack {
                            Text("小計").font(.caption).foregroundStyle(Theme.textSecondary)
                            Spacer()
                            Text(MoneyFormat.currency(nw.assets.reduce(Decimal(0)) { $0 + $1.market_value.value }))
                                .font(.caption.monospacedDigit())
                        }
                    }
                    Divider()
                    row("總資產", nw.total_assets.value, Theme.textPrimary)
                    row("總負債", nw.total_liabilities.value, Theme.expense)
                    row("淨資產", nw.net_worth.value, Theme.primary, bold: true)
                }
            }
        }
    }

    private func row(_ label: String, _ v: Decimal, _ color: Color, bold: Bool = false) -> some View {
        HStack {
            Text(label).font(bold ? .subheadline.bold() : .subheadline)
            Spacer()
            Text(MoneyFormat.currency(v)).font((bold ? Font.headline : .subheadline).monospacedDigit()).foregroundStyle(color)
        }
    }

    // MARK: Recent

    private var recentCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("最近交易").font(.headline)
                if recent.isEmpty {
                    Text("還沒有交易").font(.subheadline).foregroundStyle(Theme.textMuted)
                }
                ForEach(recent) { t in
                    TransactionRow(transaction: t, compact: true)
                    if t.id != recent.last?.id { Divider() }
                }
            }
        }
    }

    // MARK: Loading

    private func load() async {
        let (from, to) = range
        let q: [String: String?] = ["date_from": DateCoding.format(from), "date_to": DateCoding.format(to)]
        var sq = q
        sq["period"] = period.rawValue
        let api = APIClient.shared
        async let s: DashboardSummary = api.get("/dashboard/summary", query: sq)
        async let b: ItemsResponse<CategoryBreakdownItem> = api.get("/dashboard/category-breakdown", query: q)
        async let t: ItemsResponse<TrendPoint> = api.get("/dashboard/trend", query: q)
        async let r: ListResponse<Transaction> = api.get("/transactions", query: ["limit": "5"])
        do {
            summary = try await s
            breakdown = try await b.items
            trend = try await t.items
            recent = try await r.items
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        await loadNetWorth()
    }

    private func loadNetWorth() async {
        do {
            netWorth = try await APIClient.shared.get("/net-worth")
            netWorthError = nil
        } catch let e as APIError where e.status == 424 {
            netWorthError = "報價服務暫時無法使用，總資產 / 淨資產暫時無法計算，請稍後再試。"
        } catch {
            netWorthError = error.localizedDescription
        }
    }
}

/// Taiwan convention by default: red = up, green = down.
struct GainBadge: View {
    let percent: Decimal?
    var body: some View {
        if let p = percent {
            let up = p >= 0
            Text("\(up ? "+" : "")\(MoneyFormat.number(p, fraction: 1))%")
                .font(.caption2.bold())
                .padding(.horizontal, 6).padding(.vertical, 2)
                .foregroundStyle(up ? Theme.expense : Theme.income)
                .background((up ? Theme.expense : Theme.income).opacity(0.12), in: Capsule())
        }
    }
}
