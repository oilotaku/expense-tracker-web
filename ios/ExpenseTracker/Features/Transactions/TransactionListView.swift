import SwiftUI

struct TransactionRow: View {
    @Environment(AppState.self) private var state
    let transaction: Transaction
    var compact = false

    private var isTransfer: Bool { transaction.transaction_type == .transfer }

    private var title: String {
        let date = DateCoding.display(transaction.transaction_date, compact ? "MM/dd" : "yyyy/MM/dd")
        if isTransfer {
            let other = state.account(transaction.transfer_counterpart_account_uid)?.name ?? "?"
            return "\(date)・轉帳 \(transaction.transfer_direction == .out ? "→" : "←") \(other)"
        }
        return "\(date)・\(state.category(transaction.category_uid)?.name ?? "未分類")"
    }

    private var subtitle: String {
        let desc = transaction.description.isEmpty ? "（無明細）" : transaction.description
        let account = state.account(transaction.account_uid)?.name ?? "?"
        return "\(desc)・\(account)"
    }

    private var amountText: String {
        let currency = state.account(transaction.account_uid)?.currency ?? .TWD
        let sign: String
        switch transaction.transaction_type {
        case .income: sign = "+"
        case .expense: sign = "-"
        case .transfer: sign = transaction.transfer_direction == .out ? "-" : "+"
        }
        return "\(sign)\(MoneyFormat.number(transaction.amount.value, fraction: compact ? 0 : 2)) \(currency.rawValue)"
    }

    var body: some View {
        HStack(spacing: 12) {
            if isTransfer {
                IconBadge(icon: "bank", color: Theme.chartOther, size: 34)
            } else if let c = state.category(transaction.category_uid) {
                IconBadge(icon: c.icon, color: c.color, size: 34)
            } else {
                IconBadge(icon: "other", color: Theme.chartOther, size: 34)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.subheadline.weight(.medium)).foregroundStyle(Theme.textPrimary).lineLimit(1)
                Text(subtitle).font(.caption).foregroundStyle(Theme.textSecondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(amountText)
                .layoutPriority(1)
                .font(.subheadline.weight(.semibold).monospacedDigit())
                .foregroundStyle(Theme.amountColor(transaction.transaction_type))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .contentShape(Rectangle())
    }
}

struct TransactionListView: View {
    @Environment(AppState.self) private var state

    @State private var items: [Transaction] = []
    @State private var total = 0
    @State private var loading = false
    @State private var error: String?

    @State private var useDateFilter = false
    @State private var dateFrom = DateCoding.monthRange(containing: Date()).0
    @State private var dateTo = Date()
    @State private var categoryUID: UUID?
    @State private var accountUID: UUID?
    @State private var typeFilter: TransactionType?
    @State private var showFilters = false

    @State private var editing: Transaction?
    @State private var deleting: Transaction?

    private let pageSize = 100

    private var visible: [Transaction] {
        items.filter { t in
            (accountUID == nil || t.account_uid == accountUID) && (typeFilter == nil || t.transaction_type == typeFilter)
        }
    }

    private var filterKey: String {
        "\(useDateFilter)\(dateFrom)\(dateTo)\(categoryUID?.uuidString ?? "")\(state.revision)"
    }

    var body: some View {
        List {
            if showFilters { filterSection }
            if let error { Section { ErrorBanner(message: error) } }
            Section {
                ForEach(visible) { t in
                    TransactionRow(transaction: t)
                        .onTapGesture { editing = t }
                        .swipeActions {
                            Button(role: .destructive) { deleting = t } label: { Label("刪除", systemImage: "trash") }
                        }
                }
                if items.count < total {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                    .task(id: items.count) { await loadMore() }
                }
            } footer: {
                if !loading && visible.isEmpty {
                    Text("沒有符合條件的交易").frame(maxWidth: .infinity)
                } else {
                    Text("已載入 \(items.count) / \(total) 筆").frame(maxWidth: .infinity)
                }
            }
        }
        .navigationTitle("交易")
        .toolbar {
            Button { withAnimation { showFilters.toggle() } } label: {
                Image(systemName: hasFilter ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
            }
        }
        .refreshable { await reload() }
        .task(id: filterKey) { await reload() }
        .sheet(item: $editing) { t in TransactionFormView(mode: .edit(t)) }
        .confirmationDialog(
            "刪除「\(deleting?.description.isEmpty == false ? deleting!.description : "這筆交易")」？",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible
        ) {
            Button("刪除", role: .destructive) {
                if let t = deleting { Task { await delete(t) } }
            }
        }
    }

    private var hasFilter: Bool {
        useDateFilter || categoryUID != nil || accountUID != nil || typeFilter != nil
    }

    private var filterSection: some View {
        Section("篩選") {
            Toggle("限定日期", isOn: $useDateFilter)
            if useDateFilter {
                DatePicker("起始日期", selection: $dateFrom, displayedComponents: .date)
                DatePicker("結束日期", selection: $dateTo, in: dateFrom..., displayedComponents: .date)
            }
            Picker("分類", selection: $categoryUID) {
                Text("全部分類").tag(UUID?.none)
                ForEach(state.categories) { Text($0.name).tag(UUID?.some($0.category_uid)) }
            }
            Picker("帳戶", selection: $accountUID) {
                Text("全部帳戶").tag(UUID?.none)
                ForEach(state.accounts) { Text($0.name).tag(UUID?.some($0.account_uid)) }
            }
            Picker("類型", selection: $typeFilter) {
                Text("全部類型").tag(TransactionType?.none)
                ForEach(TransactionType.allCases) { Text($0.label).tag(TransactionType?.some($0)) }
            }
            if hasFilter {
                Button("清除篩選") {
                    useDateFilter = false
                    categoryUID = nil
                    accountUID = nil
                    typeFilter = nil
                }
            }
        }
    }

    private func query(offset: Int) -> [String: String?] {
        var q: [String: String?] = ["limit": String(pageSize), "offset": String(offset)]
        if let categoryUID { q["category_uid"] = categoryUID.uuidString }
        if useDateFilter {
            q["date_from"] = DateCoding.format(DateCoding.startOfDay(dateFrom))
            q["date_to"] = DateCoding.format(DateCoding.endOfDay(dateTo))
        }
        return q
    }

    private func reload() async {
        loading = true
        defer { loading = false }
        do {
            let r: ListResponse<Transaction> = try await APIClient.shared.get("/transactions", query: query(offset: 0))
            items = r.items
            total = r.total
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadMore() async {
        guard !loading, items.count < total else { return }
        loading = true
        defer { loading = false }
        do {
            let r: ListResponse<Transaction> = try await APIClient.shared.get("/transactions", query: query(offset: items.count))
            let known = Set(items.map(\.id))
            items.append(contentsOf: r.items.filter { !known.contains($0.id) })
            total = r.items.isEmpty ? items.count : r.total
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete(_ t: Transaction) async {
        do {
            if let group = t.transfer_group_uid {
                try await APIClient.shared.delete("/transactions/transfer/\(group.uuidString)")
            } else {
                try await APIClient.shared.delete("/transactions/\(t.transaction_uid.uuidString)")
            }
            deleting = nil
            state.didChange()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
