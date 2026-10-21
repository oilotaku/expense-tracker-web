import SwiftUI
import UIKit

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        let v = UInt64(s, radix: 16) ?? 0x9C96AF
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }

    static func adaptive(light: String, dark: String) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(Color(hex: dark)) : UIColor(Color(hex: light)) })
    }
}

enum Theme {
    static let bg = Color.adaptive(light: "#faf8fc", dark: "#1c1826")
    static let surface = Color.adaptive(light: "#ffffff", dark: "#241f30")
    static let sunken = Color.adaptive(light: "#f2effa", dark: "#2c2638")
    static let border = Color.adaptive(light: "#e7e2f3", dark: "#3a3448")
    static let textPrimary = Color.adaptive(light: "#2b2740", dark: "#f0edf7")
    static let textSecondary = Color.adaptive(light: "#6b6480", dark: "#b4acc9")
    static let textMuted = Color.adaptive(light: "#9c96af", dark: "#8b84a0")
    static let primary = Color.adaptive(light: "#8257d6", dark: "#a98cf0")
    static let primarySoft = Color.adaptive(light: "#ede6fb", dark: "#332950")
    static let income = Color.adaptive(light: "#2f7d49", dark: "#7bde9b")
    static let expense = Color.adaptive(light: "#c14b42", dark: "#f2a79d")
    static let warning = Color.adaptive(light: "#c97a1e", dark: "#eac066")
    static let danger = Color.adaptive(light: "#b23636", dark: "#f0958f")

    static let palette = ["#8B6ED6", "#E8834B", "#2FA98A", "#D9A428", "#3E8FD0", "#D65FA0", "#8AAE3C", "#5A4FA0"]
    static let chartOther = "#9C96AF"
    private static let paletteDark = ["#a78bea", "#f0985f", "#45c6a5", "#e8bb4a", "#5ca8e8", "#e687ba", "#a3c65c", "#7a6fc0"]
    private static let chartColors: [Color] = zip(palette, paletteDark).map { Color.adaptive(light: $0, dark: $1) }
    static let chartOtherColor = Color.adaptive(light: chartOther, dark: "#6e667f")

    /// Rank-based chart color that brightens in dark mode like the web app.
    static func chartColor(_ rank: Int) -> Color { chartColors[rank % chartColors.count] }

    static func amountColor(_ type: TransactionType) -> Color {
        switch type {
        case .income: income
        case .expense: expense
        case .transfer: textSecondary
        }
    }
}

struct Card<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            // Shadow on the shape only; putting it on the whole card makes SwiftUI
            // rasterize every child (text, icons) into the shadow pass.
            .background {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Theme.surface)
                    .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
            }
    }
}

struct ColorDot: View {
    let color: Color
    var size: CGFloat = 10
    init(color: Color, size: CGFloat = 10) { self.color = color; self.size = size }
    init(hex: String, size: CGFloat = 10) { self.init(color: Color(hex: hex), size: size) }
    var body: some View { Circle().fill(color).frame(width: size, height: size) }
}

struct ErrorBanner: View {
    let message: String?
    var body: some View {
        if let message {
            Text(message)
                .font(.footnote)
                .foregroundStyle(Theme.danger)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(Theme.danger.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
        }
    }
}

extension View {
    func screenBackground() -> some View {
        background(Theme.bg.ignoresSafeArea())
    }
}
