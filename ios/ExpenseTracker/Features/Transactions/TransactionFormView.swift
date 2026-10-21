import SwiftUI

struct TransactionFormView: View {
    enum Mode {
        case create
        case edit(Transaction)
    }

    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let mode: Mode

    @State private var type: TransactionType = .expense
    @State private var date = Date()
    @State private var expression = ""
    @State private var categoryUID: UUID?
    @State private var description = ""
    @State private var accountUID: UUID?
    @State private var toAccountUID: UUID?
    @State private var paymentMethod = ""
    @State private var showMoreCategories = false

    @State private var recurring = false
    @State private var intervalUnit: IntervalUnit = .month
    @State private var intervalCount = 1
    @State private var anchorDate = Date()

    @State private var error: String?
    @State private var toast: String?
    @State private var busy = false
    @State private var loaded = false

    @AppStorage("defaultAccountUID") private var defaultAccountUID = ""
    @AppStorage("lastAccountUID") private var lastAccountUID = ""
    @AppStorage("recentCategoryUIDs") private var recentCategoryRaw = ""

    private var editing: Transaction? {
        if case let .edit(t) = mode { return t }
        return nil
    }
    private var isEdit: Bool { editing != nil }
    private var amount: Decimal? { AmountKeypad.evaluate(expression) }

    private var orderedCategories: [Category] {
        let recent = recentCategoryRaw.split(separator: ",").compactMap { UUID(uuidString: String($0)) }
        let byRecent = recent.compactMap { uid in state.categories.first { $0.category_uid == uid } }
        return byRecent + state.categories.filter { c in !recent.contains(c.category_uid) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if editing?.transaction_type != .transfer {
                        Picker("類型", selection: $type) {
                            ForEach(isEdit ? [TransactionType.expense, .income] : TransactionType.allCases) {
                                Text($0.label).tag($0)
                            }
                        }
                        .pickerStyle(.segmented)
                    }

                    amountDisplay
                    AmountKeypad(expression: $expression)

                    if type != .transfer { categoryGrid }

                    Card {
                        VStack(alignment: .leading, spacing: 12) {
                            DatePicker("日期", selection: $date, displayedComponents: .date)
                            TextField("明細", text: $description)
                                .onChange(of: description) { _, v in if v.count > 255 { description = String(v.prefix(255)) } }
                            Divider()
                            AccountPicker(label: type == .transfer ? "轉出帳戶" : "帳戶", showCurrency: true, selection: $accountUID)
                            if type == .transfer {
                                AccountPicker(label: "轉入帳戶", showCurrency: true, selection: $toAccountUID)
                                if let a = state.account(accountUID), let b = state.account(toAccountUID), a.currency != b.currency {
                                    Text("\(a.currency.rawValue) → \(b.currency.rawValue)：將以即時匯率換算成 \(b.currency.rawValue)")
                                        .font(.caption).foregroundStyle(Theme.warning)
                                }
                            }
                            Divider()
                            PaymentMethodField(text: $paymentMethod)
                        }
                    }

                    if !isEdit && type != .transfer { recurringCard }

                    ErrorBanner(message: error)
                    if let toast {
                        Text(toast).font(.footnote).foregroundStyle(Theme.income)
                    }

                    VStack(spacing: 10) {
                        Button { Task { await save(again: false) } } label: {
                            Text(busy ? "儲存中…" : "儲存").bold().frame(maxWidth: .infinity).padding(.vertical, 6)
                        }
                        .buttonStyle(.borderedProminent)
                        if !isEdit {
                            Button { Task { await save(again: true) } } label: {
                                Text("儲存並再記一筆").frame(maxWidth: .infinity).padding(.vertical, 4)
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    .disabled(busy)
                }
                .padding(16)
            }
            .screenBackground()
            .navigationTitle(isEdit ? "編輯交易" : "記一筆")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
            }
            .onAppear(perform: populate)
        }
        .presentationDragIndicator(.visible)
    }

    private var amountDisplay: some View {
        Card(padding: 14) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(expression.isEmpty ? "0" : expression)
                    .font(.system(size: 32, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(Theme.amountColor(type))
                    .lineLimit(1)
                    .minimumScaleFactor(0.4)
                if expression.contains(where: { "÷×−+".contains($0) }) {
                    Text("= \(amount.map { MoneyFormat.number($0) } ?? "—")")
                        .font(.footnote.monospacedDigit()).foregroundStyle(Theme.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }

    private var categoryGrid: some View {
        let cats = orderedCategories
        let shown = showMoreCategories ? cats : Array(cats.prefix(8))
        return Card(padding: 12) {
            VStack(alignment: .leading, spacing: 10) {
                FieldLabel(text: "分類")
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 10) {
                    ForEach(shown) { c in
                        Button {
                            categoryUID = categoryUID == c.category_uid ? nil : c.category_uid
                        } label: {
                            VStack(spacing: 4) {
                                IconBadge(icon: c.icon, color: categoryUID == c.category_uid ? c.color : Theme.chartOther, size: 38)
                                Text(c.name).font(.caption2).lineLimit(1)
                                    .foregroundStyle(categoryUID == c.category_uid ? Theme.textPrimary : Theme.textSecondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                if cats.count > 8 {
                    Button(showMoreCategories ? "收起 ▴" : "更多 \(cats.count - 8) 個 ▾") { showMoreCategories.toggle() }
                        .font(.footnote)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private var recurringCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Toggle("固定收支", isOn: $recurring)
                if recurring {
                    Picker("週期", selection: $intervalUnit) {
                        ForEach(IntervalUnit.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Stepper(RecurringText.interval(intervalUnit, intervalCount, anchor: DateCoding.dayString(DateCoding.startOfDay(anchorDate))),
                            value: $intervalCount, in: 1...99)
                    DatePicker("起算日", selection: $anchorDate, displayedComponents: .date)
                    Text("起算日是今天會立刻記下第一筆；其餘由伺服器每天 01:00 依週期自動產生。")
                        .font(.caption).foregroundStyle(Theme.textMuted)
                }
            }
        }
    }

    private func populate() {
        guard !loaded else { return }
        loaded = true
        if let t = editing {
            type = t.transaction_type
            date = t.transaction_date
            expression = MoneyFormat.plain(t.amount.value)
            categoryUID = t.category_uid
            description = t.description
            paymentMethod = t.payment_method
            if t.transaction_type == .transfer {
                if t.transfer_direction == .out {
                    accountUID = t.account_uid
                    toAccountUID = t.transfer_counterpart_account_uid
                } else {
                    accountUID = t.transfer_counterpart_account_uid
                    toAccountUID = t.account_uid
                }
            } else {
                accountUID = t.account_uid
            }
        } else {
            accountUID = UUID(uuidString: defaultAccountUID).flatMap { state.account($0)?.account_uid }
                ?? UUID(uuidString: lastAccountUID).flatMap { state.account($0)?.account_uid }
                ?? state.accounts.first { $0.name == "現金" }?.account_uid
                ?? state.accounts.first?.account_uid
        }
    }

    private func rememberCategory(_ uid: UUID) {
        var list = recentCategoryRaw.split(separator: ",").map(String.init).filter { $0 != uid.uuidString }
        list.insert(uid.uuidString, at: 0)
        recentCategoryRaw = list.prefix(8).joined(separator: ",")
    }

    private func save(again: Bool) async {
        guard let amount else { error = expression.isEmpty ? "請輸入金額" : "金額需大於 0"; return }
        guard let accountUID else { error = "請選擇帳戶"; return }
        let day = DateCoding.startOfDay(date)
        let api = APIClient.shared
        busy = true
        defer { busy = false }
        do {
            if type == .transfer {
                guard let toAccountUID else { error = "請選擇轉入帳戶"; return }
                guard toAccountUID != accountUID else { error = "轉出與轉入帳戶不可相同"; return }
                let body = TransferWrite(from_account_uid: accountUID, to_account_uid: toAccountUID, transaction_date: day,
                                         description: description, amount: Money(amount), payment_method: paymentMethod)
                if let group = editing?.transfer_group_uid {
                    let _: TransferResponse = try await api.patch("/transactions/transfer/\(group.uuidString)", body)
                } else {
                    let _: TransferResponse = try await api.post("/transactions/transfer", body)
                }
            } else {
                guard let category = categoryUID.flatMap({ state.category($0) }) ?? state.categories.first(where: { $0.name == "其他" }) else {
                    error = "請選擇分類"
                    return
                }
                let anchorDay = DateCoding.startOfDay(anchorDate)
                let makeRule = recurring && !isEdit
                // the 01:00 generator only sees rules that already exist, so a rule anchored today
                // gets its first transaction written here; past/future anchors are left to the server
                let writeNow = !makeRule || anchorDay == DateCoding.startOfDay(Date())
                let body = TransactionWrite(account_uid: accountUID, category_uid: category.category_uid,
                                            transaction_date: makeRule ? anchorDay : day,
                                            description: description, amount: Money(amount), transaction_type: type,
                                            payment_method: paymentMethod)
                if let t = editing {
                    let _: Transaction = try await api.patch("/transactions/\(t.transaction_uid.uuidString)", body)
                } else if writeNow {
                    let _: Transaction = try await api.post("/transactions", body)
                }
                if makeRule {
                    let rule = RecurringRuleWrite(account_uid: accountUID, category_uid: category.category_uid,
                                                  description: description, amount: Money(amount), transaction_type: type,
                                                  payment_method: paymentMethod, interval_unit: intervalUnit,
                                                  interval_count: intervalCount, anchor_date: DateCoding.dayString(anchorDay),
                                                  liability_uid: nil)
                    let _: RecurringRule = try await api.post("/recurring-rules", rule)
                }
                rememberCategory(category.category_uid)
                if !isEdit { lastAccountUID = accountUID.uuidString }
            }
            state.didChange()
            error = nil
            if again {
                toast = "已儲存 \(type.label) \(MoneyFormat.number(amount))"
                expression = ""
                categoryUID = nil
                description = ""
                recurring = false
            } else {
                dismiss()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
