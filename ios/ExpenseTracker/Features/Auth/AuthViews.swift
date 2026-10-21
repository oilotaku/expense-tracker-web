import SwiftUI

struct ServerSetupView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var url = ""
    @State private var error: String?
    @State private var checking = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://example.ts.net:8443", text: $url)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("伺服器位址")
                } footer: {
                    Text("輸入記帳網站的網址（和瀏覽器開的一樣），需能連到 Tailscale。")
                }
                if let error { Section { Text(error).foregroundStyle(Theme.danger) } }
                Section {
                    Button(checking ? "連線中…" : "連線") { Task { await save() } }
                        .disabled(url.isEmpty || checking)
                }
            }
            .navigationTitle("設定伺服器")
            .onAppear { url = state.serverURL }
        }
    }

    private func save() async {
        checking = true
        defer { checking = false }
        var u = url.trimmingCharacters(in: .whitespaces)
        if u.lowercased().hasPrefix("http://") { error = "只支援 https（登入 cookie 為 Secure，http 無法登入）"; return }
        if !u.lowercased().hasPrefix("https://") { u = "https://" + u }
        while u.hasSuffix("/") { u.removeLast() }
        let previous = state.serverURL
        state.serverURL = u
        do {
            let _: [String: String] = try await APIClient.shared.get("/health")
            error = nil
            if u != previous || state.phase != .loggedIn {
                // cookies are per host, so a different server means logging in again
                await state.bootstrap()
            }
            dismiss()
        } catch {
            state.serverURL = previous
            self.error = error.localizedDescription
        }
    }
}

struct LoginView: View {
    @Environment(AppState.self) private var state
    @State private var email = UserDefaults.standard.string(forKey: "lastEmail") ?? ""
    @State private var password = ""
    @State private var pin = ""
    @State private var usePin = false
    @State private var error: String?
    @State private var busy = false
    @State private var showServer = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    if let msg = state.bootstrapError {
                        Card(padding: 12) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("連不上伺服器：\(msg)").font(.footnote).foregroundStyle(Theme.warning)
                                Button("重試連線") { Task { await state.bootstrap() } }.font(.footnote)
                            }
                        }
                    }
                    VStack(spacing: 6) {
                        Image(systemName: "yensign.circle.fill")
                            .font(.system(size: 56))
                            .foregroundStyle(Theme.primary)
                        Text("記帳").font(.largeTitle.bold()).foregroundStyle(Theme.textPrimary)
                    }
                    .padding(.top, 40)

                    Card {
                        VStack(alignment: .leading, spacing: 14) {
                            if usePin, let r = state.rememberedUser {
                                Text(r.email).font(.subheadline).foregroundStyle(Theme.textSecondary)
                                SecureField("PIN", text: $pin)
                                    .keyboardType(.numberPad)
                                    .textContentType(.oneTimeCode)
                                    .font(.title2.monospacedDigit())
                                    .padding(12)
                                    .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 12))
                                    .onChange(of: pin) { _, v in
                                        if v.count >= 6 { Task { await submit() } }
                                    }
                            } else {
                                field("Email") {
                                    TextField("you@example.com", text: $email)
                                        .keyboardType(.emailAddress)
                                        .textContentType(.username)
                                        .textInputAutocapitalization(.never)
                                        .autocorrectionDisabled()
                                }
                                field("密碼") {
                                    SecureField("密碼", text: $password).textContentType(.password)
                                }
                            }
                            ErrorBanner(message: error)
                            Button {
                                Task { await submit() }
                            } label: {
                                Text(busy ? "登入中…" : "登入").bold().frame(maxWidth: .infinity).padding(.vertical, 6)
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(busy)

                            if state.rememberedUser != nil {
                                Button(usePin ? "改用密碼登入" : "使用 PIN 快速登入") {
                                    usePin.toggle()
                                    error = nil
                                }
                                .font(.footnote)
                                .frame(maxWidth: .infinity)
                            }
                        }
                    }
                }
                .padding(16)
            }
            .screenBackground()
            .toolbar {
                Button { showServer = true } label: { Image(systemName: "server.rack") }
            }
            .sheet(isPresented: $showServer) { ServerSetupView() }
            .onAppear { usePin = state.rememberedUser != nil }
        }
    }

    private func field<C: View>(_ label: String, @ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.footnote).foregroundStyle(Theme.textSecondary)
            c()
                .padding(12)
                .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private func submit() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            if usePin {
                try await state.loginWithPin(pin)
            } else {
                try await state.login(email: email.trimmingCharacters(in: .whitespaces), password: password)
                UserDefaults.standard.set(email, forKey: "lastEmail")
            }
            error = nil
        } catch {
            pin = ""
            self.error = error.localizedDescription
        }
    }
}

struct ChangePasswordView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    var forced = false
    @State private var current = ""
    @State private var new1 = ""
    @State private var new2 = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Form {
            if forced {
                Section { Text("管理員已重設你的密碼，請先設定新密碼。").foregroundStyle(Theme.warning) }
            }
            Section {
                SecureField(forced ? "臨時密碼" : "目前密碼", text: $current).textContentType(.password)
                SecureField("新密碼", text: $new1).textContentType(.newPassword)
                SecureField("再輸入一次新密碼", text: $new2).textContentType(.newPassword)
            }
            if let error { Section { Text(error).foregroundStyle(Theme.danger) } }
            Section {
                Button(busy ? "處理中…" : "變更密碼") { Task { await submit() } }
                    .disabled(busy || current.isEmpty || new1.isEmpty)
                if forced {
                    Button("登出", role: .destructive) { Task { await state.logout() } }
                }
            }
        }
        .navigationTitle("變更密碼")
    }

    private func submit() async {
        guard new1.count >= 8, new1.count <= 72 else { error = "新密碼需為 8～72 個字元"; return }
        guard new1 == new2 else { error = "兩次輸入的新密碼不一致"; return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.patchVoid("/auth/change-password", ChangePasswordRequest(current_password: current, new_password: new1))
            await state.refreshUser()
            if !forced { dismiss() }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
