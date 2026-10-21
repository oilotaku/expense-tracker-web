import SwiftUI

struct BudgetsView: View {
    @Environment(AppState.self) private var state
    @State private var budgets: [Budget] = []
    @State private var summaries: [UUID: BudgetSummary] = [:]
    @State private var error: String?
    @State private var busy = false
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
                    .swipeActions(allowsFullSwipe: false) {
                        Button(role: .destructive) { Task { await delete(b) } } label: { Label("刪除", systemImage: "trash") }
                    }
            }
        }
        .navigationTitle("預算")
        .toolbar { Button { showCreate = true } label: { Image(systemName: "plus") } }
        .refreshable { await load() }
        .task(id: state.revision) { await load() }
        .sheet(isPresented: $showCreate) { BudgetFormView(budget: nil) { await load() } }
        .sheet(item: $editing) { b in BudgetFormView(budget: b) { await load() } }
    }

    private func load() async {
        do {
            let all = try await state.fetchAll(Budget.self, "/budgets")
            let fetched = await withTaskGroup(of: BudgetSummary?.self, returning: [UUID: BudgetSummary].self) { group in
                for b in all {
                    group.addTask {
                        let s: BudgetSummary? = try? await APIClient.shared.get("/budgets/\(b.budget_uid.uuidString)/summary")
                        return s
                    }
                }
                var map: [UUID: BudgetSummary] = [:]
                for await s in group { if let s { map[s.budget_uid] = s } }
                return map
            }
            guard !Task.isCancelled else { return }
            budgets = all
            summaries = fetched
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete(_ b: Budget) async {
        do {
            try await APIClient.shared.delete("/budgets/\(b.budget_uid.uuidString)")
            state.didChange()
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
                if summary == nil {
                    Text("無法取得花費彙總，下拉重新整理").foregroundStyle(Theme.warning)
                } else if over, let s = summary {
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
    let onSaved: () async -> Void

    @State private var categoryUID: UUID?
    @State private var period: BudgetPeriod = .monthly
    @State private var limit = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if budget == nil {
                    CategoryPicker(selection: $categoryUID)
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
                ToolbarItem(placement: .confirmationAction) { Button("儲存") { Task { await save() } }.disabled(busy) }
            }
            .onAppear {
                if let b = budget { limit = MoneyFormat.plain(b.limit_amount.value) }
            }
        }
    }

    private func save() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        guard let v = MoneyFormat.parseAmount(limit), v > 0 else { error = "金額需大於 0"; return }
        do {
            if let b = budget {
                let _: Budget = try await APIClient.shared.patch("/budgets/\(b.budget_uid.uuidString)", BudgetUpdateRequest(limit_amount: Money(v)))
            } else {
                guard let categoryUID else { error = "請選擇分類"; return }
                let _: Budget = try await APIClient.shared.post("/budgets", BudgetCreateRequest(category_uid: categoryUID, period_type: period, limit_amount: Money(v)))
            }
            state.didChange()
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
