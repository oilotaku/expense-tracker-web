import SwiftUI

/// Offline / pending-upload status shown at the top of the main screens.
struct OfflineBanner: View {
    @Environment(AppState.self) private var state
    @State private var checking = false

    private var waiting: Int { state.myPending.filter { $0.status == .waiting }.count }
    private var stuck: Int { state.myPending.count - waiting }

    var body: some View {
        if let note = state.syncNote, !state.isOffline, waiting == 0, stuck == 0 {
            row(icon: "checkmark.icloud", text: note, color: Theme.income, retry: false)
        } else if state.isOffline || waiting > 0 || stuck > 0 {
            row(icon: state.isOffline ? "icloud.slash" : "icloud.and.arrow.up", text: message,
                color: stuck > 0 ? Theme.danger : Theme.warning, retry: true)
        }
    }

    private var message: String {
        var parts: [String] = []
        if state.isOffline {
            parts.append(state.offlineDataAt.map { "離線中，顯示 \(DateCoding.display($0, "M/d HH:mm")) 的資料" } ?? "離線中")
        }
        if waiting > 0 { parts.append("\(waiting) 筆待上傳（餘額尚未計入）") }
        if stuck > 0 { parts.append("\(stuck) 筆需要處理（見交易頁）") }
        return parts.joined(separator: "・")
    }

    private func row(icon: String, text: String, color: Color, retry: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
            Text(text).frame(maxWidth: .infinity, alignment: .leading)
            if retry {
                if checking {
                    ProgressView().controlSize(.small)
                } else {
                    Button("重試") {
                        Task {
                            checking = true
                            await state.probe()
                            checking = false
                        }
                    }
                    .buttonStyle(.borderless)
                }
            }
        }
        .font(.footnote)
        .foregroundStyle(color)
        .padding(10)
        .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
    }
}
