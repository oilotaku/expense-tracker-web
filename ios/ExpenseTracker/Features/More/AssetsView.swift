import SwiftUI

extension AssetType {
    var label: String {
        switch self {
        case .stock: "台股"
        case .us_stock: "美股"
        case .metal: "貴金屬"
        case .fund: "基金"
        }
    }

    var units: [String] {
        switch self {
        case .stock: ["張", "股"]
        case .us_stock: ["股"]
        case .metal: ["錢", "兩"]
        case .fund: ["單位"]
        }
    }

    var namePlaceholder: String {
        switch self {
        case .stock: "股票代號，例：2330"
        case .us_stock: "代號，例：AAPL"
        case .metal: "品項，例：黃金"
        case .fund: "鉅亨網代號，例：A16003"
        }
    }
}

struct AssetsView: View {
    @Environment(AppState.self) private var state
    @State private var assets: [FinancialAsset] = []
    @State private var liabilities: [Liability] = []
    @State private var rules: [RecurringRule] = []
    @State private var gains: [UUID: Decimal] = [:]
    @State private var error: String?

    @State private var showAddAsset = false
    @State private var editingAsset: FinancialAsset?
    @State private var showAddLiability = false
    @State private var editingLiability: Liability?
    @State private var repaying: Liability?
    @State private var planning: Liability?

    var body: some View {
        List {
            if let error { Section { ErrorBanner(message: error) } }
            Section {
                if assets.isEmpty { Text("尚無金融資產").foregroundStyle(Theme.textMuted) }
                ForEach(assets) { a in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(a.asset_type.label).font(.caption2).padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(Theme.primarySoft, in: Capsule()).foregroundStyle(Theme.primary)
                                Text(a.name).font(.headline)
                            }
                            Text("\(MoneyFormat.plain(a.input_quantity.value)) \(a.input_unit)・本金 \(a.principal_amount.map { MoneyFormat.number($0.value) } ?? "—")")
                                .font(.caption).foregroundStyle(Theme.textSecondary)
                        }
                        Spacer()
                        GainBadge(percent: gains[a.financial_asset_uid])
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { editingAsset = a }
                    .swipeActions {
                        Button(role: .destructive) { Task { await run { try await APIClient.shared.delete("/financial-assets/\(a.financial_asset_uid.uuidString)") } } } label: {
                            Label("刪除", systemImage: "trash")
                        }
                    }
                }
            } header: {
                HStack {
                    Text("金融資產")
                    Spacer()
                    Button { showAddAsset = true } label: { Image(systemName: "plus.circle") }
                }
            }

            Section {
                if liabilities.isEmpty { Text("尚無負債").foregroundStyle(Theme.textMuted) }
                ForEach(liabilities) { l in liabilityRow(l) }
            } header: {
                HStack {
                    Text("負債")
                    Spacer()
                    Button { showAddLiability = true } label: { Image(systemName: "plus.circle") }
                }
            }
        }
        .navigationTitle("資產 / 負債")
        .refreshable { await load() }
        .task(id: state.revision) { await load() }
        .sheet(isPresented: $showAddAsset) { AssetFormView(asset: nil, existing: assets) { await load() } }
        .sheet(item: $editingAsset) { AssetFormView(asset: $0, existing: assets) { await load() } }
        .sheet(isPresented: $showAddLiability) { LiabilityFormView(liability: nil) { await load() } }
        .sheet(item: $editingLiability) { LiabilityFormView(liability: $0) { await load() } }
        .sheet(item: $repaying) { RepayFormView(liability: $0) { await load() } }
        .sheet(item: $planning) { l in RecurringFormView(rule: nil, liability: l) { await load() } }
    }

    private func liabilityRow(_ l: Liability) -> some View {
        let plan = rules.first { $0.liability_uid == l.liability_uid }
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(l.name).font(.headline)
                Text("年利率 \(l.interest_rate.map { MoneyFormat.plain($0.value) + "%" } ?? "—")")
                    .font(.caption).foregroundStyle(Theme.textSecondary)
                Spacer()
                Text(MoneyFormat.number(l.amount.value)).font(.body.monospacedDigit()).foregroundStyle(Theme.expense)
            }
            if let p = plan {
                HStack {
                    Text("\(p.is_active ? "定期還款中" : "定期還款（已暫停）")：\(MoneyFormat.number(p.amount.value))・\(state.account(p.account_uid)?.name ?? "")・\(RecurringText.interval(p.interval_unit, p.interval_count, anchor: p.anchor_date))")
                        .font(.caption)
                    Spacer()
                    Button("取消", role: .destructive) {
                        Task { await run { try await APIClient.shared.delete("/recurring-rules/\(p.recurring_rule_uid.uuidString)") } }
                    }
                    .font(.caption)
                    .buttonStyle(.borderless)
                }
                .padding(8)
                .background(Theme.primarySoft, in: RoundedRectangle(cornerRadius: 10))
            }
            HStack(spacing: 16) {
                Button("還款") { repaying = l }
                if plan == nil { Button("定期還款") { planning = l } }
                Button("編輯") { editingLiability = l }
                Spacer()
            }
            .font(.footnote)
            .buttonStyle(.borderless)
        }
        .swipeActions {
            Button(role: .destructive) { Task { await run { try await APIClient.shared.delete("/liabilities/\(l.liability_uid.uuidString)") } } } label: {
                Label("刪除", systemImage: "trash")
            }
        }
    }

    private func run(_ op: () async throws -> Void) async {
        do {
            try await op()
            state.didChange()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func load() async {
        do {
            async let a: ListResponse<FinancialAsset> = APIClient.shared.get("/financial-assets")
            async let l: ListResponse<Liability> = APIClient.shared.get("/liabilities")
            async let r: ListResponse<RecurringRule> = APIClient.shared.get("/recurring-rules")
            assets = try await a.items
            liabilities = try await l.items
            rules = (try? await r.items) ?? []
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        if let nw: NetWorth = try? await APIClient.shared.get("/net-worth") {
            var g: [UUID: Decimal] = [:]
            for item in nw.assets { if let p = item.gain_percent { g[item.financial_asset_uid] = p.value } }
            gains = g
        }
    }
}

private struct AssetFormView: View {
    @Environment(\.dismiss) private var dismiss
    let asset: FinancialAsset?
    let existing: [FinancialAsset]
    let onSaved: () async -> Void

    @State private var type: AssetType = .stock
    @State private var name = ""
    @State private var quantity = ""
    @State private var unit = "張"
    @State private var principal = ""
    @State private var error: String?

    private var normalizedName: String {
        let n = name.trimmingCharacters(in: .whitespaces)
        return type == .us_stock ? n.uppercased() : n
    }

    private var mergeTarget: FinancialAsset? {
        guard asset == nil, !normalizedName.isEmpty else { return nil }
        return existing.first { $0.asset_type == type && $0.name.lowercased() == normalizedName.lowercased() }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if asset == nil {
                        Picker("類型", selection: $type) {
                            ForEach(AssetType.allCases) { Text($0.label).tag($0) }
                        }
                        .onChange(of: type) { _, t in if !t.units.contains(unit) { unit = t.units[0] } }
                    } else {
                        LabeledContent("類型", value: type.label)
                    }
                    TextField(type.namePlaceholder, text: $name)
                        .textInputAutocapitalization(type == .us_stock ? .characters : .never)
                        .autocorrectionDisabled()
                    HStack {
                        TextField("數量", text: $quantity).keyboardType(.decimalPad)
                        if type.units.count > 1 {
                            Picker("", selection: $unit) { ForEach(type.units, id: \.self) { Text($0).tag($0) } }
                                .pickerStyle(.segmented).frame(width: 110)
                        } else {
                            Text(type.units[0]).foregroundStyle(Theme.textSecondary)
                        }
                    }
                    TextField("本金（新台幣）", text: $principal).keyboardType(.decimalPad)
                } footer: {
                    if let m = mergeTarget {
                        Text("已有「\(m.name)」\(MoneyFormat.plain(m.input_quantity.value)) \(m.input_unit)，送出後會合併數量與本金，不會另開一筆")
                    }
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .navigationTitle(asset == nil ? "新增資產" : "編輯資產")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("儲存") { Task { await save() } } }
            }
            .onAppear {
                if let a = asset {
                    type = a.asset_type
                    name = a.name
                    quantity = MoneyFormat.plain(a.input_quantity.value)
                    unit = a.input_unit
                    principal = a.principal_amount.map { MoneyFormat.plain($0.value) } ?? ""
                }
            }
        }
    }

    private func save() async {
        guard !normalizedName.isEmpty else { error = "請輸入名稱或代號"; return }
        guard let q = MoneyFormat.parse(quantity), q > 0 else { error = "數量需大於 0"; return }
        let p = MoneyFormat.parse(principal)
        do {
            if let a = asset {
                let body = FinancialAssetUpdateRequest(name: normalizedName, input_quantity: Money(q), input_unit: unit, principal_amount: p.map(Money.init))
                let _: FinancialAsset = try await APIClient.shared.patch("/financial-assets/\(a.financial_asset_uid.uuidString)", body)
            } else {
                guard let p, p > 0 else { error = "本金需大於 0"; return }
                let body = FinancialAssetCreateRequest(asset_type: type, name: normalizedName, input_quantity: Money(q), input_unit: unit, principal_amount: Money(p))
                let _: FinancialAsset = try await APIClient.shared.post("/financial-assets", body)
            }
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct LiabilityFormView: View {
    @Environment(\.dismiss) private var dismiss
    let liability: Liability?
    let onSaved: () async -> Void

    @State private var name = ""
    @State private var amount = ""
    @State private var rate = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("名稱", text: $name)
                TextField("金額", text: $amount).keyboardType(.decimalPad)
                TextField("年利率 %（選填）", text: $rate).keyboardType(.decimalPad)
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .navigationTitle(liability == nil ? "新增負債" : "編輯負債")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("儲存") { Task { await save() } } }
            }
            .onAppear {
                if let l = liability {
                    name = l.name
                    amount = MoneyFormat.plain(l.amount.value)
                    rate = l.interest_rate.map { MoneyFormat.plain($0.value) } ?? ""
                }
            }
        }
    }

    private func save() async {
        let n = name.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty else { error = "請輸入名稱"; return }
        guard let a = MoneyFormat.parse(amount), a > 0 else { error = "金額需大於 0"; return }
        let r = rate.isEmpty ? nil : MoneyFormat.parse(rate)
        if !rate.isEmpty && r == nil { error = "利率格式錯誤"; return }
        let body = LiabilityWrite(name: n, amount: Money(a), interest_rate: r.map(Money.init))
        do {
            if let l = liability {
                let _: Liability = try await APIClient.shared.patch("/liabilities/\(l.liability_uid.uuidString)", body)
            } else {
                let _: Liability = try await APIClient.shared.post("/liabilities", body)
            }
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct RepayFormView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let liability: Liability
    let onSaved: () async -> Void

    @State private var amount = ""
    @State private var accountUID: UUID?
    @State private var categoryUID: UUID?
    @State private var paymentMethod = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("目前金額", value: MoneyFormat.number(liability.amount.value))
                    TextField("還款金額", text: $amount).keyboardType(.decimalPad)
                    Picker("帳戶", selection: $accountUID) {
                        Text("請選擇").tag(UUID?.none)
                        ForEach(state.accounts) { Text($0.name).tag(UUID?.some($0.account_uid)) }
                    }
                    Picker("分類", selection: $categoryUID) {
                        Text("請選擇").tag(UUID?.none)
                        ForEach(state.categories) { Text($0.name).tag(UUID?.some($0.category_uid)) }
                    }
                    HStack {
                        TextField("支付方式", text: $paymentMethod)
                        Menu {
                            ForEach(TransactionFormView.paymentSuggestions, id: \.self) { s in Button(s) { paymentMethod = s } }
                        } label: { Image(systemName: "chevron.down.circle") }
                    }
                } footer: {
                    Text("還款金額須大於 0 且小於目前金額；全部還清請改用「刪除」。會同時記一筆支出。")
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .navigationTitle("還款：\(liability.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("還款") { Task { await save() } } }
            }
        }
    }

    private func save() async {
        guard let a = MoneyFormat.parse(amount), a > 0, a < liability.amount.value else {
            error = "還款金額須大於 0 且小於目前金額"
            return
        }
        guard let accountUID, let categoryUID, !paymentMethod.isEmpty else { error = "帳戶、分類、支付方式都必填"; return }
        do {
            let _: Liability = try await APIClient.shared.post(
                "/liabilities/\(liability.liability_uid.uuidString)/repay",
                LiabilityRepayRequest(amount: Money(a), account_uid: accountUID, category_uid: categoryUID, payment_method: paymentMethod))
            state.didChange()
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
