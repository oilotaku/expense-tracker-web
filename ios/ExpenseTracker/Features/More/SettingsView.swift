import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var state
    @AppStorage("defaultAccountUID") private var defaultAccountUID = ""
    @AppStorage("appearance") private var appearance = "system"
    @AppStorage("quoteSource") private var quoteSource = "device"

    @State private var pinSheet: PinSheet.Mode?
    @State private var showServer = false

    var body: some View {
        Form {
            Section("帳號") {
                LabeledContent("Email", value: state.user?.email ?? "")
                NavigationLink("變更密碼") { ChangePasswordView() }
            }

            Section {
                if state.user?.has_pin == true {
                    Button("變更 PIN") { pinSheet = .change }
                    Button("停用 PIN", role: .destructive) { pinSheet = .disable }
                } else {
                    Button("設定 PIN 快速登入") { pinSheet = .set }
                }
            } header: {
                Text("PIN 快速登入")
            } footer: {
                Text("設定後，這台裝置下次登入只要輸入 6 位數 PIN。")
            }

            Section("記帳") {
                Picker("預設帳戶", selection: $defaultAccountUID) {
                    Text("自動（現金 → 第一個）").tag("")
                    ForEach(state.accounts) { Text($0.name).tag($0.account_uid.uuidString) }
                }
            }

            Section {
                Picker("報價來源", selection: $quoteSource) {
                    Text("手機直抓").tag("device")
                    Text("伺服器").tag("server")
                }
                .pickerStyle(.segmented)
                Button("清除報價快取") { Task { await QuoteService.shared.clearCache() } }
            } header: {
                Text("金融報價")
            } footer: {
                Text("手機直抓：用這台手機自己的網路向證交所、Yahoo、鉅亨網、gold-api、open.er-api 取價，不經過伺服器；失敗時自動改用伺服器報價。")
            }

            Section("外觀") {
                Picker("主題", selection: $appearance) {
                    Text("跟隨系統").tag("system")
                    Text("淺色").tag("light")
                    Text("深色").tag("dark")
                }
                .pickerStyle(.segmented)
            }

            Section("伺服器") {
                LabeledContent("位址") {
                    Text(state.serverURL).lineLimit(1).truncationMode(.middle)
                }
                Button("變更伺服器") { showServer = true }
            }

            Section {
                Button("登出", role: .destructive) { Task { await state.logout() } }
            } footer: {
                Text("版本 \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")")
            }
        }
        .navigationTitle("設定")
        .onAppear {
            if !defaultAccountUID.isEmpty, UUID(uuidString: defaultAccountUID).flatMap({ state.account($0) }) == nil { defaultAccountUID = "" }
        }
        .sheet(item: $pinSheet) { PinSheet(mode: $0) }
        .sheet(isPresented: $showServer) { ServerSetupView() }
    }
}

struct PinSheet: View {
    enum Mode: String, Identifiable {
        case set, change, disable
        var id: String { rawValue }
    }

    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let mode: Mode

    @State private var password = ""
    @State private var currentPin = ""
    @State private var pin = ""
    @State private var pin2 = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                switch mode {
                case .set:
                    SecureField("密碼", text: $password).textContentType(.password)
                    pinField("PIN（6 位數）", $pin)
                    pinField("再輸入一次 PIN", $pin2)
                case .change:
                    pinField("目前 PIN", $currentPin)
                    pinField("新 PIN", $pin)
                    pinField("再輸入一次新 PIN", $pin2)
                case .disable:
                    SecureField("密碼", text: $password).textContentType(.password)
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .navigationTitle(mode == .set ? "設定 PIN" : mode == .change ? "變更 PIN" : "停用 PIN")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "處理中…" : "確定") { Task { await submit() } }.disabled(busy)
                }
            }
        }
    }

    private func pinField(_ label: String, _ binding: Binding<String>) -> some View {
        SecureField(label, text: binding)
            .keyboardType(.numberPad)
            .onChange(of: binding.wrappedValue) { _, v in
                let digits = String(v.filter(\.isNumber).prefix(6))
                if digits != v { binding.wrappedValue = digits }
            }
    }

    private func submit() async {
        if mode == .change {
            guard currentPin.count == 6 else { error = "目前 PIN 需為 6 位數字"; return }
        } else {
            guard !password.isEmpty else { error = "請輸入密碼"; return }
        }
        if mode != .disable {
            guard pin.count == 6 else { error = "PIN 需為 6 位數字"; return }
            guard pin == pin2 else { error = "兩次輸入的 PIN 不一致，請重新輸入"; pin = ""; pin2 = ""; return }
        }
        busy = true
        defer { busy = false }
        do {
            let api = APIClient.shared
            switch mode {
            case .set: try await api.postVoid("/auth/pin", SetPinRequest(pin: pin, password: password))
            case .change: try await api.patchVoid("/auth/pin", ChangePinRequest(current_pin: currentPin, new_pin: pin))
            case .disable: try await api.delete("/auth/pin", DisablePinRequest(password: password))
            }
            await state.refreshUser()
            dismiss()
        } catch let e as APIError where e.status == 409 && mode == .set {
            await state.refreshUser()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
