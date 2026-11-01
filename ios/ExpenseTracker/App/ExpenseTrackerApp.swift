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
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("appearance") private var appearance = "system"
    @AppStorage(Theme.accentKey) private var accent = "lavender"

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
                    // dynamic colors only re-resolve on a rebuild, so switching themes returns to the first tab
                    MainTabView().tint(Theme.primary).id(accent)
                }
            }
        }
        .preferredColorScheme(scheme)
        .environment(\.timeZone, DateCoding.tz)
        .task { await state.bootstrap() }
        .onChange(of: scenePhase) { _, phase in
            // back from the background: upload anything recorded offline, refresh if we were offline
            if phase == .active { Task { await state.probe() } }
        }
    }
}
