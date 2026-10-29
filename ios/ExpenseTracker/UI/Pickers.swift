import SwiftUI
import PhotosUI

struct IconItem {
    let key: String
    let label: String
    let symbol: String
}

enum IconCatalog {
    static let all: [IconItem] = [
        IconItem(key: "food", label: "餐飲", symbol: "fork.knife"),
        IconItem(key: "transport", label: "交通", symbol: "bus.fill"),
        IconItem(key: "entertainment", label: "娛樂", symbol: "gamecontroller.fill"),
        IconItem(key: "shopping", label: "購物", symbol: "bag.fill"),
        IconItem(key: "medical", label: "醫療", symbol: "cross.case.fill"),
        IconItem(key: "home", label: "居住", symbol: "house.fill"),
        IconItem(key: "subscription", label: "訂閱", symbol: "arrow.triangle.2.circlepath"),
        IconItem(key: "salary", label: "薪資", symbol: "banknote.fill"),
        IconItem(key: "other", label: "其他", symbol: "square.grid.2x2.fill"),
        IconItem(key: "bank", label: "銀行", symbol: "building.columns.fill"),
        IconItem(key: "wallet", label: "現金", symbol: "wallet.pass.fill"),
        IconItem(key: "creditCard", label: "信用卡", symbol: "creditcard.fill"),
        IconItem(key: "savings", label: "儲蓄", symbol: "dollarsign.circle.fill"),
    ]

    static func symbol(_ key: String) -> String {
        all.first { $0.key == key }?.symbol ?? "circle.fill"
    }
}

/// Built-in key → SF Symbol on a coloured circle; `custom:<uid>` → the uploaded image with no circle
/// (colourful artwork on a coloured disc looks muddy, ADR-0006 §7).
struct IconBadge: View {
    let icon: String
    let color: String
    var size: CGFloat = 36

    var body: some View {
        if let uid = CustomIcon.uid(icon) {
            CustomIconImage(uid: uid, fallbackColor: color, size: size)
        } else {
            BuiltinIconBadge(symbol: IconCatalog.symbol(icon), color: color, size: size)
        }
    }
}

struct BuiltinIconBadge: View {
    let symbol: String
    let color: String
    let size: CGFloat

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color(hex: color), in: Circle())
    }
}

struct CustomIconImage: View {
    let uid: UUID
    var fallbackColor: String = Theme.chartOther
    let size: CGFloat
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().interpolation(.high).scaledToFit()
                    .frame(width: size, height: size)
            } else if failed {
                // Deleted icon or offline without a cached copy.
                BuiltinIconBadge(symbol: "circle.fill", color: fallbackColor, size: size)
            } else {
                Color.clear.frame(width: size, height: size)
            }
        }
        .task(id: uid) {
            let loaded = await IconImageCache.shared.image(for: uid)
            image = loaded
            failed = loaded == nil
        }
        .accessibilityLabel("自訂圖示")
    }
}

struct IconPicker: View {
    @Environment(AppState.self) private var state
    @Binding var selection: String
    var color: String
    @State private var uploadData: IdentifiableData?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 12) {
                ForEach(IconCatalog.all, id: \.key) { item in
                    Button {
                        selection = item.key
                    } label: {
                        VStack(spacing: 4) {
                            IconBadge(icon: item.key, color: selection == item.key ? color : Theme.chartOther, size: 40)
                            Text(item.label).font(.caption2).foregroundStyle(Theme.textSecondary)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }

            // Pick only; deleting lives on the 我的圖示 screen so it can't happen by accident here.
            FieldLabel(text: "我的圖示")
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 12) {
                ForEach(state.icons) { icon in
                    Button {
                        selection = icon.icon_key
                    } label: {
                        CustomIconImage(uid: icon.user_icon_uid, size: 40)
                            .padding(3)
                            .overlay {
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(selection == icon.icon_key ? Theme.primary : .clear, lineWidth: 2)
                            }
                    }
                    .buttonStyle(.plain)
                }
                IconPhotoPickerButton(compact: true, disabled: state.iconQuota.used >= state.iconQuota.limit) {
                    uploadData = IdentifiableData(data: $0)
                }
            }
        }
        .padding(.vertical, 4)
        .sheet(item: $uploadData) { item in
            IconUploadSheet(sourceData: item.data) { icon in selection = icon.icon_key }
        }
    }
}

struct SwatchPicker: View {
    @Binding var selection: String

    var body: some View {
        HStack(spacing: 10) {
            ForEach(Theme.palette, id: \.self) { hex in
                Button {
                    selection = hex
                } label: {
                    Circle()
                        .fill(Color(hex: hex))
                        .frame(width: 28, height: 28)
                        .overlay {
                            if selection.caseInsensitiveCompare(hex) == .orderedSame {
                                Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(.white)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
    }
}

/// Calculator-style amount entry: supports + − × ÷ with normal precedence.
struct AmountKeypad: View {
    @Binding var expression: String

    private let rows: [[String]] = [
        ["7", "8", "9", "÷"],
        ["4", "5", "6", "×"],
        ["1", "2", "3", "−"],
        [".", "0", "⌫", "+"],
    ]

    var body: some View {
        VStack(spacing: 8) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 8) {
                    ForEach(row, id: \.self) { key in
                        Button { tap(key) } label: {
                            Text(key)
                                .font(.title3.weight(.medium))
                                .frame(maxWidth: .infinity, minHeight: 46)
                                .background(isOperator(key) ? Theme.primarySoft : Theme.sunken,
                                            in: RoundedRectangle(cornerRadius: 12))
                                .foregroundStyle(isOperator(key) ? Theme.primary : Theme.textPrimary)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func isOperator(_ k: String) -> Bool { "÷×−+".contains(k) }

    private func tap(_ key: String) {
        switch key {
        case "⌫":
            if !expression.isEmpty { expression.removeLast() }
        case "÷", "×", "−", "+":
            guard let last = expression.last else { return }
            if isOperator(String(last)) { expression.removeLast() }
            expression.append(key)
        case ".":
            let current = expression.split(whereSeparator: { isOperator(String($0)) }).last.map(String.init) ?? ""
            if expression.isEmpty || isOperator(String(expression.last!)) { expression.append("0.") }
            else if !current.contains(".") { expression.append(".") }
        default:
            expression.append(key)
        }
    }

    /// Evaluates the expression; returns nil when empty, non-finite or ≤ 0.
    static func evaluate(_ expr: String) -> Decimal? {
        var terms: [Decimal] = []
        var ops: [Character] = []
        var number = ""
        func flush() -> Bool {
            guard let v = Decimal(string: number, locale: Locale(identifier: "en_US_POSIX")) else { return false }
            terms.append(v)
            number = ""
            return true
        }
        for ch in expr {
            if "÷×−+".contains(ch) {
                if !flush() { return nil }
                ops.append(ch)
            } else {
                number.append(ch)
            }
        }
        if number.isEmpty { if !ops.isEmpty { ops.removeLast() } } else if !flush() { return nil }
        guard !terms.isEmpty else { return nil }

        var sums: [Decimal] = [terms[0]]
        var signs: [Character] = []
        for (i, op) in ops.enumerated() where i + 1 < terms.count {
            let rhs = terms[i + 1]
            switch op {
            case "×": sums[sums.count - 1] *= rhs
            case "÷":
                if rhs == 0 { return nil }
                sums[sums.count - 1] /= rhs
            default:
                signs.append(op)
                sums.append(rhs)
            }
        }
        var result = sums[0]
        for (i, s) in signs.enumerated() { result = s == "+" ? result + sums[i + 1] : result - sums[i + 1] }
        var rounded = Decimal()
        NSDecimalRound(&rounded, &result, 2, .plain)
        return rounded > 0 ? rounded : nil
    }
}

struct FieldLabel: View {
    let text: String
    var body: some View { Text(text).font(.footnote).foregroundStyle(Theme.textSecondary) }
}

struct PaymentMethodField: View {
    @Binding var text: String
    static let suggestions = ["現金", "信用卡", "金融卡", "行動支付", "銀行轉帳", "其他"]

    var body: some View {
        HStack {
            TextField("支付方式", text: $text)
                .onChange(of: text) { _, v in if v.count > 50 { text = String(v.prefix(50)) } }
            Menu {
                ForEach(Self.suggestions, id: \.self) { s in Button(s) { text = s } }
            } label: { Image(systemName: "chevron.down.circle") }
        }
    }
}

struct AccountPicker: View {
    @Environment(AppState.self) private var state
    var label = "帳戶"
    var showCurrency = false
    @Binding var selection: UUID?

    var body: some View {
        Picker(label, selection: $selection) {
            Text("請選擇").tag(UUID?.none)
            ForEach(state.accounts) { a in
                Text(showCurrency ? "\(a.name)（\(a.currency.rawValue)）" : a.name).tag(UUID?.some(a.account_uid))
            }
        }
    }
}

struct CategoryPicker: View {
    @Environment(AppState.self) private var state
    var label = "分類"
    @Binding var selection: UUID?

    var body: some View {
        Picker(label, selection: $selection) {
            Text("請選擇").tag(UUID?.none)
            ForEach(state.categories) { Text($0.name).tag(UUID?.some($0.category_uid)) }
        }
    }
}
