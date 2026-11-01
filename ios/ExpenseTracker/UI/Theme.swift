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

struct AccentTheme: Identifiable {
    let id: String
    let name: String
    let swatch: String
    let light: [String: String]
    let dark: [String: String]
}

enum Theme {
    static let accentKey = "accentTheme"

    /// Same values as the web's data-accent blocks in globals.css; "lavender" has no overrides.
    static let accents: [AccentTheme] = [
        AccentTheme(id: "lavender", name: "薰衣草紫", swatch: "#8257d6", light: [:], dark: [:]),
        AccentTheme(id: "ocean", name: "海洋藍", swatch: "#0975b7",
                    light: ["bg": "#f6f9fd", "surface-sunken": "#e9f2fb", "border": "#d9e7f4", "text-primary": "#162d40", "text-secondary": "#546c81", "text-muted": "#889db0", "primary-100": "#dbedfd", "primary-300": "#7ec0f7", "primary-500": "#0194e9", "primary-600": "#0975b7", "primary-700": "#025d94"],
                    dark: ["bg": "#0f1c27", "surface": "#152431", "surface-sunken": "#1b2b39", "border": "#283a49", "text-primary": "#e8f0f8", "text-secondary": "#9cb5cb", "text-muted": "#748ca1", "primary-100": "#0b3451", "primary-300": "#46a0e6", "primary-500": "#44a8f4", "primary-600": "#0084d0", "primary-700": "#89c5f8"]),
        AccentTheme(id: "teal", name: "青碧", swatch: "#047c7c",
                    light: ["bg": "#f5fafa", "surface-sunken": "#e6f4f4", "border": "#d4eaea", "text-primary": "#063232", "text-secondary": "#4a7171", "text-muted": "#80a2a1", "primary-100": "#d5f1f0", "primary-300": "#5bcecd", "primary-500": "#07a2a2", "primary-600": "#047c7c", "primary-700": "#016464"],
                    dark: ["bg": "#091f1f", "surface": "#0d2727", "surface-sunken": "#132f2f", "border": "#203e3d", "text-primary": "#e5f2f2", "text-secondary": "#93bab9", "text-muted": "#6b9191", "primary-100": "#023939", "primary-300": "#0bafaf", "primary-500": "#01b7b8", "primary-600": "#118e8f", "primary-700": "#6cd2d1"]),
        AccentTheme(id: "forest", name: "森林綠", swatch: "#0a803b",
                    light: ["bg": "#f6faf7", "surface-sunken": "#eaf4ec", "border": "#dbeadd", "text-primary": "#1a311f", "text-secondary": "#57705c", "text-muted": "#8ba18e", "primary-100": "#ddf0e0", "primary-300": "#88cc96", "primary-500": "#15a950", "primary-600": "#0a803b", "primary-700": "#04672d"],
                    dark: ["bg": "#111e14", "surface": "#17271a", "surface-sunken": "#1e2e21", "border": "#2b3d2e", "text-primary": "#e9f2ea", "text-secondary": "#9fb9a3", "text-muted": "#77907c", "primary-100": "#113a1d", "primary-300": "#53b06b", "primary-500": "#53b96f", "primary-600": "#169346", "primary-700": "#91d09e"]),
        AccentTheme(id: "amber", name: "琥珀橘", swatch: "#a65d0b",
                    light: ["bg": "#fcf8f5", "surface-sunken": "#f9efe7", "border": "#f1e2d6", "text-primary": "#3c2513", "text-secondary": "#7c634f", "text-muted": "#ac9584", "primary-100": "#f9e6d7", "primary-300": "#eaa973", "primary-500": "#cd740d", "primary-600": "#a65d0b", "primary-700": "#864a04"],
                    dark: ["bg": "#24180d", "surface": "#2e1f12", "surface-sunken": "#362619", "border": "#463425", "text-primary": "#f6ede6", "text-secondary": "#c6ac97", "text-muted": "#9d8370", "primary-100": "#4a2704", "primary-300": "#d48337", "primary-500": "#e18833", "primary-600": "#be6b08", "primary-700": "#ecb07f"]),
        AccentTheme(id: "rose", name: "玫瑰紅", swatch: "#cb355d",
                    light: ["bg": "#fdf7f8", "surface-sunken": "#fbedef", "border": "#f4dfe1", "text-primary": "#3e2126", "text-secondary": "#805f63", "text-muted": "#b09195", "primary-100": "#fde3e5", "primary-300": "#f39daa", "primary-500": "#e15776", "primary-600": "#cb355d", "primary-700": "#a92149"],
                    dark: ["bg": "#261518", "surface": "#301c1f", "surface-sunken": "#382326", "border": "#483034", "text-primary": "#f8ebed", "text-secondary": "#caa7ab", "text-muted": "#a17f83", "primary-100": "#4d2029", "primary-300": "#de7386", "primary-500": "#eb778c", "primary-600": "#ce566f", "primary-700": "#f6a6b2"]),
        AccentTheme(id: "graphite", name: "石墨灰", swatch: "#657189",
                    light: ["bg": "#f8f9fa", "surface-sunken": "#f0f1f3", "border": "#e3e5e9", "text-primary": "#292b30", "text-secondary": "#66696f", "text-muted": "#989a9f", "primary-100": "#e8eaee", "primary-300": "#b2b9c8", "primary-500": "#838ea6", "primary-600": "#657189", "primary-700": "#4f5a6f"],
                    dark: ["bg": "#191b1e", "surface": "#212226", "surface-sunken": "#282a2d", "border": "#36383c", "text-primary": "#eeeff1", "text-secondary": "#aeb1b7", "text-muted": "#86898f", "primary-100": "#2d3139", "primary-300": "#9099ac", "primary-500": "#97a1b5", "primary-600": "#768095", "primary-700": "#b8becc"]),
    ]

    /// Resolved on every render; RootView rebuilds the UI when the choice changes.
    private static func themed(_ token: String, darkToken: String? = nil, light: String, dark: String) -> Color {
        Color(UIColor { traits in
            let accent = accents.first { $0.id == UserDefaults.standard.string(forKey: accentKey) }
            let hex = traits.userInterfaceStyle == .dark ? accent?.dark[darkToken ?? token] ?? dark : accent?.light[token] ?? light
            return UIColor(Color(hex: hex))
        })
    }

    static let bg = themed("bg", light: "#faf8fc", dark: "#1c1826")
    static let surface = themed("surface", light: "#ffffff", dark: "#241f30")
    static let sunken = themed("surface-sunken", light: "#f2effa", dark: "#2c2638")
    static let border = themed("border", light: "#e7e2f3", dark: "#3a3448")
    static let textPrimary = themed("text-primary", light: "#2b2740", dark: "#f0edf7")
    static let textSecondary = themed("text-secondary", light: "#6b6480", dark: "#b4acc9")
    static let textMuted = themed("text-muted", light: "#9c96af", dark: "#8b84a0")
    static let primary = themed("primary-600", darkToken: "primary-500", light: "#8257d6", dark: "#a98cf0")
    static let primarySoft = themed("primary-100", light: "#ede6fb", dark: "#332950")
    static let income = Color.adaptive(light: "#2f7d49", dark: "#7bde9b")
    static let expense = Color.adaptive(light: "#c14b42", dark: "#f2a79d")
    static let warning = Color.adaptive(light: "#c97a1e", dark: "#eac066")
    static let danger = Color.adaptive(light: "#b23636", dark: "#f0958f")

    static let palette = ["#8B6ED6", "#E8834B", "#2FA98A", "#D9A428", "#3E8FD0", "#D65FA0", "#8AAE3C", "#5A4FA0",
                               "#A20A01", "#D34635", "#9B6E19", "#3B6209", "#0E9021", "#2BC0E9", "#BF9CE5", "#9F257C"]
    static let chartOther = "#9C96AF"
    private static let paletteDark = ["#a78bea", "#f0985f", "#45c6a5", "#e8bb4a", "#5ca8e8", "#e687ba", "#a3c65c", "#7a6fc0"]
    // zip stops at paletteDark's 8: the extended swatches are picker-only, never chart series.
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
