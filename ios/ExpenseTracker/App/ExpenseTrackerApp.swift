import SwiftUI

@main
struct ExpenseTrackerApp: App {
    @State private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(state)
                .tint(Theme.primary)
        }
    }
}

struct RootView: View {
    @Environment(AppState.self) private var state
    @AppStorage("appearance") private var appearance = "system"

    private var scheme: ColorScheme? {
        switch appearance {
        case "light": .light
        case "dark": .dark
        default: nil
        }
    }

    var body: some View {
        Group {
            switch state.phase {
            case .launching:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).screenBackground()
            case .needsServer:
                ServerSetupView()
            case .loggedOut:
                LoginView()
            case .loggedIn:
                if state.user?.must_change_password == true {
                    NavigationStack { ChangePasswordView(forced: true) }
                } else {
                    MainTabView()
                }
            }
        }
        .preferredColorScheme(scheme)
        .task { await state.bootstrap() }
    }
}
