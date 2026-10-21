import SwiftUI

enum RecurringText {
    static func interval(_ unit: IntervalUnit, _ count: Int, anchor: String) -> String {
        let base = count == 1 ? "每\(unit.label)" : "每 \(count) \(unit.label)"
        if unit == .month, let day = Int(anchor.suffix(2)) { return "\(base)第 \(day) 天" }
        return base
    }
}

struct RecurringView: View {
    @Environment(AppState.self) private var state
    @State private var rules: [RecurringRule] = []
    @State private var liabilities: [Liability] = []
    @State private var error: String?
    @State private var showCreate = false
    @State private var editing: RecurringRule?

    var body: some View {
        List {
            if let error { Section { ErrorBanner(message: error) } }
            if rules.isEmpty { Text("還沒有固定收支").foregroundStyle(Theme.textMuted) }
            ForEach(rules) { r in
                row(r)
                    .contentShape(Rectangle())
                    .onTapGesture { if r.liability_uid == nil { editing = r } }
                    .swipeActions {
                        Button(role: .destructive) { Task { await delete(r) } } label: { Label("刪除", systemImage: "trash") }
                        Button { Task { await toggle(r) } } label: {
                            Label(r.is_active ? "暫停" : "恢復", systemImage: r.is_active ? "pause" : "play")
                        }
                        .tint(Theme.warning)
                    }
            }
        }
        .navigationTitle("固定收支")
        .toolbar { Button { showCreate = true } label: { Image(systemName: "plus") } }
        .refreshable { await load() }
        .task(id: state.revision) { await load() }
        .sheet(isPresented: $showCreate) { RecurringFormView(rule: nil) { await load() } }
        .sheet(item: $editing) { RecurringFormView(rule: $0) { await load() } }
    }

    private func row(_ r: RecurringRule) -> some View {
        let title: String
        if let lid = r.liability_uid {
            title = "負債還款：\(liabilities.first { $0.liability_uid == lid }?.name ?? "—")"
        } else {
            title = state.category(r.category_uid)?.name ?? "未分類"
        }
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title).font(.headline).lineLimit(1)
                if !r.is_active {
                    Text("已暫停").font(.caption2).padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Theme.sunken, in: Capsule())
                }
                Spacer()
                Text("\(r.transaction_type == .income ? "+" : "-")\(MoneyFormat.number(r.amount.value))")
                    .font(.body.monospacedDigit())
                    .foregroundStyle(Theme.amountColor(r.transaction_type))
            }
            Text([r.description.isEmpty ? nil : r.description,
                  state.account(r.account_uid)?.name,
                  RecurringText.interval(r.interval_unit, r.interval_count, anchor: r.anchor_date)]
                .compactMap { $0 }.joined(separator: "・"))
                .font(.caption).foregroundStyle(Theme.textSecondary)
        }
        .opacity(r.is_active ? 1 : 0.5)
    }

    private func load() async {
        do {
            async let r: ListResponse<RecurringRule> = APIClient.shared.get("/recurring-rules")
            async let l: ListResponse<Liability> = APIClient.shared.get("/liabilities")
            rules = try await r.items
            liabilities = (try? await l.items) ?? []
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func toggle(_ r: RecurringRule) async {
        do {
            let _: RecurringRule = try await APIClient.shared.patch("/recurring-rules/\(r.recurring_rule_uid.uuidString)", RecurringRuleActiveUpdate(is_active: !r.is_active))
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete(_ r: RecurringRule) async {
        do {
            try await APIClient.shared.delete("/recurring-rules/\(r.recurring_rule_uid.uuidString)")
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Also used for liability repayment plans when `liability` is set.
struct RecurringFormView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let rule: RecurringRule?
    var liability: Liability? = nil
    let onSaved: () async -> Void

    @State private var type: TransactionType = .expense
    @State private var categoryUID: UUID?
    @State private var accountUID: UUID?
    @State private var description = ""
    @State private var amount = ""
    @State private var paymentMethod = ""
    @State private var unit: IntervalUnit = .month
    @State private var count = 1
    @State private var anchor = Date()
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if liability == nil {
                        Picker("類型", selection: $type) {
                            Text("支出").tag(TransactionType.expense)
                            Text("收入").tag(TransactionType.income)
                        }
                        .pickerStyle(.segmented)
                        TextField("描述", text: $description)
                    } else if let l = liability {
                        LabeledContent("負債", value: l.name)
                    }
                    TextField(liability == nil ? "金額" : "每期金額", text: $amount).keyboardType(.decimalPad)
                    CategoryPicker(selection: $categoryUID)
                    AccountPicker(label: liability == nil ? "帳戶" : "扣款帳戶", selection: $accountUID)
                    PaymentMethodField(text: $paymentMethod)
                }
                Section("週期") {
                    Stepper(RecurringText.interval(unit, count, anchor: DateCoding.dayString(anchor)), value: $count, in: 1...99)
                    Picker("單位", selection: $unit) {
                        ForEach(IntervalUnit.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    DatePicker("起算日", selection: $anchor, displayedComponents: .date)
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .navigationTitle(liability != nil ? "定期還款" : (rule == nil ? "新增固定收支" : "編輯固定收支"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("儲存") { Task { await save() } } }
            }
            .onAppear(perform: populate)
        }
    }

    private func populate() {
        guard let r = rule else {
            accountUID = state.accounts.first?.account_uid
            return
        }
        type = r.transaction_type
        categoryUID = r.category_uid
        accountUID = r.account_uid
        description = r.description
        amount = MoneyFormat.plain(r.amount.value)
        paymentMethod = r.payment_method
        unit = r.interval_unit
        count = r.interval_count
        anchor = DateCoding.day(r.anchor_date) ?? Date()
    }

    private func save() async {
        guard let v = MoneyFormat.parse(amount), v > 0 else { error = "金額需大於 0"; return }
        guard let categoryUID else { error = "請選擇分類"; return }
        guard let accountUID else { error = "請選擇帳戶"; return }
        let body = RecurringRuleWrite(
            account_uid: accountUID, category_uid: categoryUID,
            description: liability.map { "\($0.name) 定期還款" } ?? description,
            amount: Money(v), transaction_type: liability == nil ? type : .expense,
            payment_method: paymentMethod, interval_unit: unit, interval_count: count,
            anchor_date: DateCoding.dayString(anchor), liability_uid: liability?.liability_uid ?? rule?.liability_uid)
        do {
            if let r = rule {
                let _: RecurringRule = try await APIClient.shared.patch("/recurring-rules/\(r.recurring_rule_uid.uuidString)", body)
            } else {
                let _: RecurringRule = try await APIClient.shared.post("/recurring-rules", body)
            }
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
