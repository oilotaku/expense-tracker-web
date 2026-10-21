import SwiftUI

struct BudgetsView: View {
    @Environment(AppState.self) private var state
    @State private var budgets: [Budget] = []
    @State private var summaries: [UUID: BudgetSummary] = [:]
    @State private var error: String?
    @State private var showCreate = false
    @State private var editing: Budget?

    var body: some View {
        List {
            if let error { Section { ErrorBanner(message: error) } }
            if budgets.isEmpty {
                Text("還沒有預算，按右上角 + 新增").foregroundStyle(Theme.textMuted)
            }
            ForEach(budgets) { b in
                BudgetRow(budget: b, summary: summaries[b.budget_uid])
                    .contentShape(Rectangle())
                    .onTapGesture { editing = b }
                    .swipeActions {
                        Button(role: .destructive) { Task { await delete(b) } } label: { Label("刪除", systemImage: "trash") }
                    }
            }
        }
        .navigationTitle("預算")
        .toolbar { Button { showCreate = true } label: { Image(systemName: "plus") } }
        .refreshable { await load() }
        .task(id: state.revision) { await load() }
        .sheet(isPresented: $showCreate) { BudgetFormView(budget: nil, existing: budgets) { await load() } }
        .sheet(item: $editing) { b in BudgetFormView(budget: b, existing: budgets) { await load() } }
    }

    private func load() async {
        do {
            let r: ListResponse<Budget> = try await APIClient.shared.get("/budgets", query: ["limit": "100"])
            budgets = r.items
            var map: [UUID: BudgetSummary] = [:]
            for b in r.items {
                if let s: BudgetSummary = try? await APIClient.shared.get("/budgets/\(b.budget_uid.uuidString)/summary") {
                    map[s.budget_uid] = s
                }
            }
            summaries = map
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete(_ b: Budget) async {
        do {
            try await APIClient.shared.delete("/budgets/\(b.budget_uid.uuidString)")
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct BudgetRow: View {
    @Environment(AppState.self) private var state
    let budget: Budget
    let summary: BudgetSummary?

    var body: some View {
        let cat = state.category(budget.category_uid)
        let limit = budget.limit_amount.double
        let spent = summary?.spent_amount.double ?? 0
        let pct = limit > 0 ? spent / limit * 100 : 0
        let over = summary?.is_over_budget ?? false
        let color: Color = over ? Theme.danger : (pct >= 80 ? Theme.warning : Theme.primary)

        VStack(alignment: .leading, spacing: 8) {
            HStack {
                IconBadge(icon: cat?.icon ?? "other", color: cat?.color ?? Theme.chartOther, size: 30)
                Text(cat?.name ?? "未分類").font(.headline).lineLimit(1)
                Text(budget.period_type.label).font(.caption).foregroundStyle(Theme.textMuted)
                Spacer(minLength: 8)
                Text("\(MoneyFormat.currency(Decimal(spent))) / \(MoneyFormat.currency(budget.limit_amount.value))")
                    .font(.caption.monospacedDigit()).foregroundStyle(Theme.textSecondary)
                    .lineLimit(1).minimumScaleFactor(0.8).layoutPriority(1)
            }
            ProgressView(value: min(max(pct, 0), 100), total: 100).tint(color)
            Group {
                if over, let s = summary {
                    Text("🔴 已超支 \(MoneyFormat.currency(abs(s.remaining_amount.value)))")
                } else if pct >= 80 {
                    Text("⚠ 已使用 \(Int(pct))%")
                } else {
                    Text("✓ 已使用 \(Int(pct))%")
                }
            }
            .font(.caption)
            .foregroundStyle(color)
        }
        .padding(.vertical, 4)
    }
}

private struct BudgetFormView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let budget: Budget?
    let existing: [Budget]
    let onSaved: () async -> Void

    @State private var categoryUID: UUID?
    @State private var period: BudgetPeriod = .monthly
    @State private var limit = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                if budget == nil {
                    Picker("分類", selection: $categoryUID) {
                        Text("請選擇").tag(UUID?.none)
                        ForEach(state.categories) { Text($0.name).tag(UUID?.some($0.category_uid)) }
                    }
                    Picker("週期", selection: $period) {
                        ForEach(BudgetPeriod.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                } else if let b = budget {
                    LabeledContent("分類", value: state.category(b.category_uid)?.name ?? "未分類")
                    LabeledContent("週期", value: b.period_type.label)
                }
                TextField("上限金額", text: $limit).keyboardType(.decimalPad)
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .navigationTitle(budget == nil ? "新增預算" : "編輯預算")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("儲存") { Task { await save() } } }
            }
            .onAppear {
                if let b = budget { limit = MoneyFormat.plain(b.limit_amount.value) }
            }
        }
    }

    private func save() async {
        guard let v = MoneyFormat.parse(limit), v > 0 else { error = "金額需大於 0"; return }
        do {
            if let b = budget {
                let _: Budget = try await APIClient.shared.patch("/budgets/\(b.budget_uid.uuidString)", BudgetUpdateRequest(limit_amount: Money(v)))
            } else {
                guard let categoryUID else { error = "請選擇分類"; return }
                let _: Budget = try await APIClient.shared.post("/budgets", BudgetCreateRequest(category_uid: categoryUID, period_type: period, limit_amount: Money(v)))
            }
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
