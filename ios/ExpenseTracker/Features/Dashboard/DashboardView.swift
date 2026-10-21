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
    @AppStorage("quoteSource") private var quoteSource = "device"

    @State private var period: DashboardPeriod = .month
    @State private var anchor = Date()
    @State private var customFrom = DateCoding.monthRange(containing: Date()).0
    @State private var customTo = Date()

    @State private var summary: DashboardSummary?
    @State private var breakdown: [CategoryBreakdownItem] = []
    @State private var trend: [TrendPoint] = []
    @State private var netWorth: NetWorth?
    @State private var netWorthError: String?
    @State private var netWorthNote: String?
    @State private var recent: [Transaction] = []
    @State private var error: String?

    /// Backend rejects custom spans longer than 366 days.
    private var maxCustomTo: Date {
        DateCoding.calendar.date(byAdding: .day, value: 366, to: DateCoding.startOfDay(customFrom)) ?? customFrom
    }

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
        .animation(.snappy, value: summary)
        .animation(.snappy, value: chartType)
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
                VStack(spacing: 6) {
                    DatePicker("起始", selection: $customFrom, in: ...customTo, displayedComponents: .date)
                    DatePicker("結束", selection: $customTo, in: customFrom...maxCustomTo, displayedComponents: .date)
                }
                .font(.subheadline)
                .onChange(of: customFrom) { _, _ in
                    if customTo > maxCustomTo { customTo = maxCustomTo }
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
                        .contentTransition(.numericText())
                        .font(.system(.largeTitle, design: .rounded, weight: .bold))
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
                    if period == .custom {
                        Text("—").font(.title2.bold()).foregroundStyle(Theme.textMuted)
                        Text("預算僅支援月／年度檢視").font(.caption).foregroundStyle(Theme.textMuted)
                    } else if let v = summary?.budget_remaining?.value {
                        Text(MoneyFormat.currency(v))
                            .contentTransition(.numericText())
                            .font(.title2.bold()).foregroundStyle(v < 0 ? Theme.danger : Theme.warning)
                    } else {
                        Text("—").font(.title2.bold()).foregroundStyle(Theme.textMuted)
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
                    .contentTransition(.numericText())
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
        let color: Color
    }

    @State private var pieSelection: Double?
    @State private var trendSelection: Date?

    /// Top 6 by amount, the rest folded into 「其他」; colors follow rank, not the category color.
    private var slices: [Slice] {
        let sorted = breakdown.sorted { $0.amount > $1.amount }.filter { $0.amount.value > 0 }
        var result = sorted.prefix(6).enumerated().map { i, item in
            Slice(id: item.category_uid.uuidString,
                  name: state.category(item.category_uid)?.name ?? "未分類",
                  amount: item.amount.double,
                  color: Theme.chartColor(i))
        }
        if sorted.count > 6 {
            let rest = sorted.dropFirst(6).reduce(0.0) { $0 + $1.amount.double }
            result.append(Slice(id: "other", name: "其他", amount: rest, color: Theme.chartOtherColor))
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
                Group {
                    switch chartType {
                    case "line": trendChart
                    case "bar": barChart
                    default: pieChart
                    }
                }
                .id(chartType)
                .transition(.opacity)
            }
        }
    }

    /// Maps the tapped angle back to a slice (angles accumulate in data order).
    private func selectedSlice(_ data: [Slice]) -> Slice? {
        guard let v = pieSelection else { return nil }
        var acc = 0.0
        for s in data {
            acc += s.amount
            if v <= acc { return s }
        }
        return nil
    }

    @ViewBuilder private var pieChart: some View {
        let data = slices
        if data.isEmpty {
            emptyChart("這段期間沒有支出")
        } else {
            let total = data.reduce(0) { $0 + $1.amount }
            let picked = selectedSlice(data)
            VStack(spacing: 14) {
                Chart(data) { s in
                    SectorMark(angle: .value("金額", s.amount), innerRadius: .ratio(0.62), angularInset: 1.5)
                        .foregroundStyle(s.color)
                        .cornerRadius(4)
                        .opacity(picked == nil || picked?.id == s.id ? 1 : 0.35)
                }
                .chartAngleSelection(value: $pieSelection)
                .chartBackground { proxy in
                    GeometryReader { geo in
                        let frame = proxy.plotFrame.map { geo[$0] } ?? geo.frame(in: .local)
                        let hole = min(frame.width, frame.height) * 0.62
                        VStack(spacing: 2) {
                            Text(picked?.name ?? "支出合計").font(.caption).foregroundStyle(Theme.textSecondary).lineLimit(1)
                            Text(MoneyFormat.currency(Decimal(picked?.amount ?? total)))
                                .font(.headline.monospacedDigit()).foregroundStyle(Theme.textPrimary)
                                .minimumScaleFactor(0.6).lineLimit(1)
                            if let picked {
                                Text(String(format: "%.0f%%", picked.amount / total * 100))
                                    .font(.caption2).foregroundStyle(Theme.textMuted)
                            }
                        }
                        .frame(width: hole * 0.88)
                        .position(x: frame.midX, y: frame.midY)
                    }
                }
                .frame(height: 190)
                .animation(.snappy, value: pieSelection)

                VStack(spacing: 6) {
                    ForEach(data) { s in
                        HStack(spacing: 8) {
                            ColorDot(color: s.color)
                            Text(s.name).font(.caption).lineLimit(1)
                            Spacer(minLength: 6)
                            Text(MoneyFormat.currency(Decimal(s.amount)))
                                .font(.caption.monospacedDigit()).foregroundStyle(Theme.textPrimary)
                            Text(String(format: "%.0f%%", s.amount / total * 100))
                                .font(.caption.monospacedDigit()).foregroundStyle(Theme.textSecondary)
                                .frame(minWidth: 38, alignment: .trailing)
                        }
                        .opacity(picked == nil || picked?.id == s.id ? 1 : 0.5)
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
                // keyed by id so two categories with the same name don't merge into one bar
                BarMark(x: .value("金額", s.amount), y: .value("分類", s.id))
                    .foregroundStyle(s.color)
                    .cornerRadius(5)
                    .annotation(position: .trailing, alignment: .leading, spacing: 6,
                                overflowResolution: .init(x: .fit, y: .disabled)) {
                        Text(MoneyFormat.currency(Decimal(s.amount)))
                            .font(.caption2.monospacedDigit()).foregroundStyle(Theme.textSecondary)
                    }
            }
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(values: data.map(\.id)) { v in
                    AxisValueLabel {
                        Text(data.first { $0.id == v.as(String.self) }?.name ?? "")
                            .font(.caption).foregroundStyle(Theme.textPrimary)
                            .lineLimit(1).frame(maxWidth: 90, alignment: .trailing)
                    }
                }
            }
            // leave room on the right for the amount annotations
            .chartXScale(domain: 0...((data.map(\.amount).max() ?? 1) * 1.45))
            .frame(height: CGFloat(data.count) * 36 + 10)
        }
    }

    private var trendPoints: [(date: Date, income: Double, expense: Double)] {
        trend.compactMap { p in DateCoding.day(p.date).map { ($0, p.income.double, p.expense.double) } }
    }

    @ViewBuilder private var trendChart: some View {
        let points = trendPoints
        if points.isEmpty {
            emptyChart("尚無趨勢資料")
        } else {
            let picked = trendSelection.flatMap { sel in
                points.min { abs($0.date.timeIntervalSince(sel)) < abs($1.date.timeIntervalSince(sel)) }
            }
            VStack(spacing: 8) {
                Chart {
                    ForEach(points, id: \.date) { p in
                        AreaMark(x: .value("日期", p.date), y: .value("金額", p.income), series: .value("類型", "收入"), stacking: .unstacked)
                            .foregroundStyle(Theme.income.opacity(0.1))
                            .interpolationMethod(.monotone)
                        LineMark(x: .value("日期", p.date), y: .value("金額", p.income), series: .value("類型", "收入"))
                            .foregroundStyle(Theme.income)
                            .lineStyle(StrokeStyle(lineWidth: 2))
                            .interpolationMethod(.monotone)
                        AreaMark(x: .value("日期", p.date), y: .value("金額", p.expense), series: .value("類型", "支出"), stacking: .unstacked)
                            .foregroundStyle(Theme.expense.opacity(0.1))
                            .interpolationMethod(.monotone)
                        LineMark(x: .value("日期", p.date), y: .value("金額", p.expense), series: .value("類型", "支出"))
                            .foregroundStyle(Theme.expense)
                            .lineStyle(StrokeStyle(lineWidth: 2))
                            .interpolationMethod(.monotone)
                    }
                    if let picked {
                        RuleMark(x: .value("日期", picked.date))
                            .foregroundStyle(Theme.textMuted.opacity(0.6))
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                        PointMark(x: .value("日期", picked.date), y: .value("金額", picked.income)).foregroundStyle(Theme.income)
                        PointMark(x: .value("日期", picked.date), y: .value("金額", picked.expense)).foregroundStyle(Theme.expense)
                    }
                }
                .chartXSelection(value: $trendSelection)
                .chartXScale(domain: range.0...range.1)
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 5)) {
                        AxisGridLine().foregroundStyle(Theme.border)
                        AxisValueLabel(format: .dateTime.month(.defaultDigits).day(), centered: false)
                            .font(.caption2).foregroundStyle(Theme.textMuted)
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) {
                        AxisGridLine().foregroundStyle(Theme.border)
                        AxisValueLabel(format: FloatingPointFormatStyle<Double>.number.notation(.compactName).precision(.fractionLength(0...1)))
                            .font(.caption2).foregroundStyle(Theme.textMuted)
                    }
                }
                .frame(height: 220)

                HStack(spacing: 14) {
                    if let picked {
                        Text(DateCoding.display(picked.date, "M/d")).font(.caption.bold()).foregroundStyle(Theme.textPrimary)
                        legend("收入", Theme.income, MoneyFormat.currency(Decimal(picked.income)))
                        legend("支出", Theme.expense, MoneyFormat.currency(Decimal(picked.expense)))
                    } else {
                        legend("收入", Theme.income, nil)
                        legend("支出", Theme.expense, nil)
                        Spacer()
                        Text("拖曳查看單日").font(.caption2).foregroundStyle(Theme.textMuted)
                    }
                }
                .font(.caption)
            }
        }
    }

    private func legend(_ name: String, _ color: Color, _ value: String?) -> some View {
        HStack(spacing: 4) {
            ColorDot(color: color)
            Text(name).foregroundStyle(Theme.textSecondary)
            if let value { Text(value).monospacedDigit().foregroundStyle(Theme.textPrimary).lineLimit(1).minimumScaleFactor(0.7) }
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
                        Text(a.name).lineLimit(1)
                        Spacer(minLength: 8)
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
                                Text(a.name).font(.subheadline).lineLimit(1)
                                Spacer(minLength: 8)
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
                    if let netWorthNote {
                        Text(netWorthNote).font(.caption2).foregroundStyle(Theme.textMuted)
                    }
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
        pieSelection = nil
        trendSelection = nil
        let (from, to) = range
        let q: [String: String?] = ["date_from": DateCoding.format(from), "date_to": DateCoding.format(to)]
        var sq = q
        sq["period"] = period.rawValue
        let api = APIClient.shared
        async let s: DashboardSummary = api.get("/dashboard/summary", query: sq)
        async let b: ItemsResponse<CategoryBreakdownItem> = api.get("/dashboard/category-breakdown", query: q)
        async let t: ItemsResponse<TrendPoint> = api.get("/dashboard/trend", query: q)
        async let r: ListResponse<Transaction> = api.get("/transactions", query: ["limit": "5"])
        var firstError: String?
        func note(_ e: Error) { if firstError == nil { firstError = e.localizedDescription } }
        let newSummary: DashboardSummary?
        do { newSummary = try await s } catch { note(error); newSummary = nil }
        let newBreakdown: [CategoryBreakdownItem]?
        do { newBreakdown = try await b.items } catch { note(error); newBreakdown = nil }
        let newTrend: [TrendPoint]?
        do { newTrend = try await t.items } catch { note(error); newTrend = nil }
        let newRecent: [Transaction]?
        do { newRecent = try await r.items } catch { note(error); newRecent = nil }
        // a newer period change cancelled us: don't flash its "已取消" error over the fresh load
        guard !Task.isCancelled else { return }
        if let newSummary { summary = newSummary }
        if let newBreakdown { breakdown = newBreakdown }
        if let newTrend { trend = newTrend }
        if let newRecent { recent = newRecent }
        error = firstError
        await loadNetWorth()
    }

    private func loadNetWorth() async {
        var fallbackNote: String?
        if quoteSource == "device" {
            do {
                async let a: ListResponse<FinancialAsset> = APIClient.shared.get("/financial-assets")
                async let l: ListResponse<Liability> = APIClient.shared.get("/liabilities")
                let r = try await QuoteService.shared.netWorth(accounts: state.accounts, assets: try await a.items, liabilities: try await l.items)
                netWorth = r.netWorth
                netWorthNote = r.staleSince.map { "報價：手機直抓（部分為 \(DateCoding.display($0, "M/d HH:mm")) 的快取）" } ?? "報價：手機直抓"
                netWorthError = nil
                return
            } catch {
                fallbackNote = "手機直抓失敗（\(error.localizedDescription)），改用伺服器報價"
            }
        }
        do {
            netWorth = try await APIClient.shared.get("/net-worth")
            netWorthNote = fallbackNote ?? "報價：伺服器"
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
