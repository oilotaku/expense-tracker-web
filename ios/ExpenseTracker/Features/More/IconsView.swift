import PhotosUI
import SwiftUI

/// Custom icons (ADR-0006 §6/§8): upload area on top, uploaded icons below; tap one for usages and delete.
struct IconsView: View {
    @Environment(AppState.self) private var state
    @State private var uploadData: IdentifiableData?
    @State private var selected: UserIcon?

    private var quotaFull: Bool { state.iconQuota.used >= state.iconQuota.limit }

    var body: some View {
        List {
            Section {
                IconPhotoPickerButton(compact: false, disabled: quotaFull) { uploadData = IdentifiableData(data: $0) }
            } footer: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(quotaFull ? "已達 \(state.iconQuota.limit) 張上限，請先刪除不用的圖示"
                                   : "支援 PNG、JPEG、HEIC、WebP、GIF，會自動縮成 256×256")
                    Text("已使用 \(state.iconQuota.used) / \(state.iconQuota.limit)")
                }
            }
            Section("已上傳圖示") {
                if state.icons.isEmpty {
                    Text("還沒有上傳圖示").foregroundStyle(Theme.textSecondary)
                } else {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 16) {
                        ForEach(state.icons) { icon in
                            Button { selected = icon } label: {
                                VStack(spacing: 6) {
                                    CustomIconImage(uid: icon.user_icon_uid, size: 52)
                                    Text(icon.usage_count > 0 ? "\(icon.usage_count) 個使用中" : "未使用")
                                        .font(.caption2).foregroundStyle(Theme.textSecondary)
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 6)
                }
            }
        }
        .navigationTitle("我的圖示")
        .task { await state.reloadIcons() }
        .refreshable { await state.reloadIcons() }
        .sheet(item: $uploadData) { item in IconUploadSheet(sourceData: item.data) { _ in } }
        .sheet(item: $selected) { icon in IconDetailView(icon: icon) }
    }
}

struct IdentifiableData: Identifiable {
    let id = UUID()
    let data: Data
}

/// Opens the photo library and hands back the raw bytes (HEIC included; prepared later).
struct IconPhotoPickerButton: View {
    var compact: Bool
    var disabled = false
    let onPicked: (Data) -> Void
    @State private var item: PhotosPickerItem?

    var body: some View {
        PhotosPicker(selection: $item, matching: .images, photoLibrary: .shared()) {
            if compact {
                VStack(spacing: 4) {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .semibold))
                        .frame(width: 40, height: 40)
                        .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 10))
                    Text("上傳").font(.caption2).foregroundStyle(Theme.textSecondary)
                }
            } else {
                Label("選擇圖片", systemImage: "photo.on.rectangle")
            }
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .onChange(of: item) { _, picked in
            guard let picked else { return }
            Task {
                if let data = try? await picked.loadTransferable(type: Data.self) { onPicked(data) }
                item = nil
            }
        }
    }
}

/// The preview is rendered by the server with the exact pipeline used on save, so what you see is what's stored.
struct IconUploadSheet: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State var sourceData: Data
    let onUploaded: (UserIcon) -> Void

    @State private var prepared: Data?
    @State private var preview: UIImage?
    @State private var removeWhite = false
    @State private var error: String?
    @State private var previewing = false
    @State private var uploading = false
    @State private var repick: PhotosPickerItem?

    private struct PreviewKey: Equatable {
        let prepared: Data?
        let removeWhite: Bool
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        tile(title: "原圖") {
                            if let ui = prepared.flatMap(UIImage.init(data:)) {
                                Image(uiImage: ui).resizable().scaledToFit()
                            }
                        }
                        tile(title: "處理後（256×256）") {
                            if let preview, !previewing {
                                Image(uiImage: preview).resizable().interpolation(.high).scaledToFit()
                            } else if error == nil {
                                ProgressView()
                            }
                        }
                    }
                }
                if let preview, !previewing {
                    Section("實際樣子") {
                        HStack(spacing: 10) {
                            themedSample(preview, label: "淺色", background: "#FFFFFF", card: "#F4F2FA", text: "#1F1D2B")
                            themedSample(preview, label: "深色", background: "#1F1D2B", card: "#2C2940", text: "#F4F2FA")
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                    }
                }
                Section {
                    Toggle("去除白色背景", isOn: $removeWhite)
                    PhotosPicker(selection: $repick, matching: .images, photoLibrary: .shared()) {
                        Text("重新選擇")
                    }
                }
                if let error { Section { ErrorBanner(message: error) } }
            }
            .navigationTitle("預覽圖示")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(uploading ? "儲存中…" : "使用這張") { Task { await upload() } }
                        .disabled(preview == nil || previewing || uploading || error != nil)
                }
            }
            .task(id: sourceData) { prepareSource() }
            .task(id: PreviewKey(prepared: prepared, removeWhite: removeWhite)) { await refreshPreview() }
            .onChange(of: repick) { _, picked in
                guard let picked else { return }
                Task {
                    if let data = try? await picked.loadTransferable(type: Data.self) { sourceData = data }
                    repick = nil
                }
            }
        }
    }

    private func tile<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 4) {
            content()
                .frame(maxWidth: .infinity, minHeight: 110, maxHeight: 110)
                .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 12))
            Text(title).font(.caption).foregroundStyle(Theme.textSecondary)
        }
    }

    /// Fixed light/dark backgrounds so both looks are visible whatever the phone's appearance.
    private func themedSample(_ image: UIImage, label: String, background: String, card: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.caption2).foregroundStyle(Color(hex: text).opacity(0.7))
            HStack(spacing: 8) {
                Image(uiImage: image).resizable().scaledToFit().frame(width: 36, height: 36)
                Text("帳戶").font(.footnote).foregroundStyle(Color(hex: text))
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(hex: card), in: RoundedRectangle(cornerRadius: 10))
            VStack(spacing: 2) {
                Image(uiImage: image).resizable().scaledToFit().frame(width: 36, height: 36)
                Text("分類").font(.caption2).foregroundStyle(Color(hex: text))
            }
            .frame(maxWidth: .infinity)
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(Color(hex: background), in: RoundedRectangle(cornerRadius: 12))
    }

    private func prepareSource() {
        error = nil
        preview = nil
        prepared = IconImagePrep.prepare(sourceData)
        if prepared == nil { error = "無法讀取這張圖片" }
    }

    private func refreshPreview() async {
        guard let prepared else { return }
        try? await Task.sleep(for: .milliseconds(300))
        if Task.isCancelled { return }
        previewing = true
        defer { if !Task.isCancelled { previewing = false } }
        do {
            let data = try await APIClient.shared.postMultipartData(
                "/icons/preview", fileData: prepared, fileName: "icon.png", mimeType: "image/png",
                fields: ["remove_white_background": removeWhite ? "true" : "false"])
            if Task.isCancelled { return }
            preview = UIImage(data: data)
            error = preview == nil ? "預覽失敗，請稍後再試" : nil
        } catch {
            if Task.isCancelled { return }
            preview = nil
            self.error = error.localizedDescription
        }
    }

    private func upload() async {
        guard let prepared else { return }
        uploading = true
        defer { uploading = false }
        do {
            let icon: UserIcon = try await APIClient.shared.postMultipart(
                "/icons", fileData: prepared, fileName: "icon.png", mimeType: "image/png",
                fields: ["remove_white_background": removeWhite ? "true" : "false"])
            await state.reloadIcons()
            onUploaded(icon)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct IconDetailView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let icon: UserIcon
    @State private var usages: IconUsages?
    @State private var error: String?
    @State private var confirming = false
    @State private var deleting = false

    private var deleteMessage: String {
        let a = usages?.accounts.count ?? 0
        let c = usages?.categories.count ?? 0
        let parts = [a > 0 ? "\(a) 個帳戶" : nil, c > 0 ? "\(c) 個分類" : nil].compactMap { $0 }
        return parts.isEmpty ? "確定刪除？" : "有 \(parts.joined(separator: "、"))會改回預設圖示，確定刪除？"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 10) {
                        sample(background: "#FFFFFF", label: "淺色", text: "#1F1D2B")
                        sample(background: "#1F1D2B", label: "深色", text: "#F4F2FA")
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                    LabeledContent("上傳日期") {
                        Text(icon.created_at.formatted(Date.FormatStyle(date: .numeric, time: .omitted).locale(Locale(identifier: "zh_TW"))))
                    }
                }
                Section("使用中") {
                    if let usages {
                        if usages.accounts.isEmpty && usages.categories.isEmpty {
                            Text("沒有帳戶或分類使用這張圖示").foregroundStyle(Theme.textSecondary)
                        }
                        ForEach(usages.accounts, id: \.account_uid) { Text("帳戶：\($0.name)") }
                        ForEach(usages.categories, id: \.category_uid) { Text("分類：\($0.name)") }
                    } else if error == nil {
                        ProgressView()
                    }
                }
                if let error { Section { ErrorBanner(message: error) } }
                Section {
                    Button(deleting ? "刪除中…" : "刪除", role: .destructive) { confirming = true }
                        .disabled(usages == nil || deleting)
                }
            }
            .navigationTitle("圖示詳細")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("關閉") { dismiss() } } }
            .task { await loadUsages() }
            .confirmationDialog(deleteMessage, isPresented: $confirming, titleVisibility: .visible) {
                Button("刪除", role: .destructive) { Task { await delete() } }
            }
        }
    }

    private func sample(background: String, label: String, text: String) -> some View {
        VStack(spacing: 6) {
            CustomIconImage(uid: icon.user_icon_uid, size: 96)
            Text(label).font(.caption2).foregroundStyle(Color(hex: text))
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(Color(hex: background), in: RoundedRectangle(cornerRadius: 12))
    }

    private func loadUsages() async {
        do {
            usages = try await APIClient.shared.get("/icons/\(icon.user_icon_uid.uuidString)/usages")
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete() async {
        deleting = true
        defer { deleting = false }
        do {
            try await APIClient.shared.delete("/icons/\(icon.user_icon_uid.uuidString)")
            // Accounts / categories that used it were switched back to the default icon server-side.
            await state.reloadReferenceData()
            state.revision += 1
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
