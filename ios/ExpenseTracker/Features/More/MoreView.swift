import SwiftUI

struct MoreView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        List {
            Section {
                NavigationLink { AccountsView() } label: { Label("帳戶管理", systemImage: "building.columns") }
                NavigationLink { CategoriesView() } label: { Label("分類管理", systemImage: "square.grid.2x2") }
                NavigationLink { RecurringView() } label: { Label("固定收支", systemImage: "arrow.triangle.2.circlepath") }
                NavigationLink { AssetsView() } label: { Label("資產 / 負債", systemImage: "chart.line.uptrend.xyaxis") }
            }
            Section {
                NavigationLink { SettingsView() } label: { Label("設定", systemImage: "gearshape") }
            } footer: {
                if let email = state.user?.email { Text("登入身分：\(email)") }
            }
        }
        .navigationTitle("更多")
    }
}

// MARK: - Accounts

struct AccountsView: View {
    @Environment(AppState.self) private var state
    @State private var editing: Account?
    @State private var showCreate = false
    @State private var deleting: Account?
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        List {
            if let error { Section { ErrorBanner(message: error) } }
            ForEach(state.accounts) { a in
                HStack(spacing: 12) {
                    IconBadge(icon: a.icon, color: a.color, size: 40)
                    VStack(alignment: .leading) {
                        Text(a.name).font(.headline).lineLimit(1)
                        Text(a.currency.rawValue).font(.caption).foregroundStyle(Theme.textMuted)
                    }
                    Spacer()
                    Text(MoneyFormat.number(a.balance.value))
                        .font(.body.monospacedDigit())
                        .lineLimit(1).layoutPriority(1)
                        .foregroundStyle(a.balance.value < 0 ? Theme.expense : Theme.textPrimary)
                }
                .contentShape(Rectangle())
                .onTapGesture { editing = a }
                .swipeActions {
                    Button(role: .destructive) { deleting = a } label: { Label("刪除", systemImage: "trash") }
                }
            }
        }
        .navigationTitle("帳戶管理")
        .toolbar { Button { showCreate = true } label: { Image(systemName: "plus") } }
        .refreshable { await state.reloadReferenceData() }
        .sheet(isPresented: $showCreate) { AccountFormView(account: nil) }
        .sheet(item: $editing) { AccountFormView(account: $0) }
        .confirmationDialog("刪除帳戶「\(deleting?.name ?? "")」？", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible, presenting: deleting) { a in
            Button("刪除", role: .destructive) { Task { await delete(a) } }
        } message: { _ in
            Text("綁定這個帳戶的固定收支會一起暫停。")
        }
    }

    private func delete(_ a: Account) async {
        guard state.accounts.count > 1 else { error = "至少需保留一個帳戶"; return }
        do {
            try await APIClient.shared.delete("/accounts/\(a.account_uid.uuidString)")
            state.didChange()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct AccountFormView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let account: Account?

    @State private var name = ""
    @State private var balance = "0"
    @State private var currency: Currency = .TWD
    @State private var color = Theme.palette[0]
    @State private var icon = "other"
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("名稱", text: $name)
                    TextField("餘額", text: $balance).keyboardType(.numbersAndPunctuation)
                    if account == nil {
                        Picker("幣別", selection: $currency) {
                            ForEach(Currency.allCases) { Text($0.rawValue).tag($0) }
                        }
                    } else {
                        LabeledContent("幣別", value: currency.rawValue)
                    }
                } footer: {
                    if account == nil { Text("幣別建立後不可變更。") }
                }
                Section("顏色") { SwatchPicker(selection: $color) }
                Section("圖示") { IconPicker(selection: $icon, color: color) }
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .navigationTitle(account == nil ? "新增帳戶" : "編輯帳戶")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("儲存") { Task { await save() } }.disabled(busy) }
            }
            .onAppear(perform: populate)
        }
    }

    private func populate() {
        if let a = account {
            name = a.name
            balance = MoneyFormat.plain(a.balance.value)
            currency = a.currency
            color = a.color
            icon = a.icon
        } else {
            let used = Set(state.accounts.map { $0.color.uppercased() })
            color = Theme.palette.first { !used.contains($0.uppercased()) } ?? Theme.palette[0]
        }
    }

    private func save() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { error = "請輸入名稱"; return }
        guard let b = MoneyFormat.parseAmount(balance) else { error = "餘額格式錯誤"; return }
        do {
            if let a = account {
                let body = AccountUpdateRequest(name: trimmed, balance: Money(b), color: color, icon: icon)
                let _: Account = try await APIClient.shared.patch("/accounts/\(a.account_uid.uuidString)", body)
            } else {
                let body = AccountCreateRequest(name: trimmed, balance: Money(b), currency: currency, color: color, icon: icon)
                let _: Account = try await APIClient.shared.post("/accounts", body)
            }
            state.didChange()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Categories

struct CategoriesView: View {
    @Environment(AppState.self) private var state
    @State private var editing: Category?
    @State private var showCreate = false
    @State private var deleting: Category?
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        List {
            if let error { Section { ErrorBanner(message: error) } }
            ForEach(state.categories) { c in
                HStack(spacing: 12) {
                    IconBadge(icon: c.icon, color: c.color, size: 34)
                    Text(c.name)
                    Spacer()
                }
                .contentShape(Rectangle())
                .onTapGesture { editing = c }
                .swipeActions {
                    Button(role: .destructive) { deleting = c } label: { Label("刪除", systemImage: "trash") }
                }
            }
        }
        .navigationTitle("分類管理")
        .toolbar { Button { showCreate = true } label: { Image(systemName: "plus") } }
        .refreshable { await state.reloadReferenceData() }
        .sheet(isPresented: $showCreate) { CategoryFormView(category: nil) }
        .sheet(item: $editing) { CategoryFormView(category: $0) }
        .confirmationDialog("刪除分類「\(deleting?.name ?? "")」？", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible, presenting: deleting) { c in
            Button("刪除", role: .destructive) { Task { await delete(c) } }
        } message: { _ in
            Text("刪除後不影響既有交易紀錄，但無法用此分類建立新交易。")
        }
    }

    private func delete(_ c: Category) async {
        do {
            try await APIClient.shared.delete("/categories/\(c.category_uid.uuidString)")
            state.didChange()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct CategoryFormView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let category: Category?

    @State private var name = ""
    @State private var color = Theme.palette[0]
    @State private var icon = "other"
    @State private var error: String?
    @State private var busy = false

    private var duplicate: Bool {
        let n = name.trimmingCharacters(in: .whitespaces)
        return state.categories.contains { $0.name == n && $0.category_uid != category?.category_uid }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("名稱", text: $name)
                    if duplicate { Text("已存在同名分類").font(.caption).foregroundStyle(Theme.danger) }
                }
                Section("顏色") { SwatchPicker(selection: $color) }
                Section("圖示") { IconPicker(selection: $icon, color: color) }
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .navigationTitle(category == nil ? "新增分類" : "編輯分類")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("儲存") { Task { await save() } }.disabled(busy) }
            }
            .onAppear {
                if let c = category { name = c.name; color = c.color; icon = c.icon }
            }
        }
    }

    private func save() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { error = "請輸入名稱"; return }
        do {
            let body = CategoryWrite(name: trimmed, color: color, icon: icon)
            if let c = category {
                let _: Category = try await APIClient.shared.patch("/categories/\(c.category_uid.uuidString)", body)
            } else {
                let _: Category = try await APIClient.shared.post("/categories", body)
            }
            state.didChange()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
