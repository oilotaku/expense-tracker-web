import SwiftUI

struct MainTabView: View {
    enum Tab: Hashable { case dashboard, transactions, add, budgets, more }

    @State private var tab: Tab = .dashboard
    @State private var lastTab: Tab = .dashboard
    @State private var showAdd = false

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack { DashboardView() }
                .tabItem { Label("首頁", systemImage: "square.grid.2x2") }
                .tag(Tab.dashboard)
            NavigationStack { TransactionListView() }
                .tabItem { Label("交易", systemImage: "arrow.left.arrow.right") }
                .tag(Tab.transactions)
            Color.clear
                .tabItem { Label("記一筆", systemImage: "plus.circle.fill") }
                .tag(Tab.add)
            NavigationStack { BudgetsView() }
                .tabItem { Label("預算", systemImage: "chart.pie") }
                .tag(Tab.budgets)
            NavigationStack { MoreView() }
                .tabItem { Label("更多", systemImage: "ellipsis") }
                .tag(Tab.more)
        }
        .onChange(of: tab) { _, new in
            if new == .add {
                showAdd = true
                tab = lastTab
            } else {
                lastTab = new
            }
        }
        .sheet(isPresented: $showAdd) {
            TransactionFormView(mode: .create)
        }
    }
}
