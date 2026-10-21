import SwiftUI

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

struct IconBadge: View {
    let icon: String
    let color: String
    var size: CGFloat = 36

    var body: some View {
        Image(systemName: IconCatalog.symbol(icon))
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color(hex: color), in: Circle())
    }
}

struct IconPicker: View {
    @Binding var selection: String
    var color: String

    var body: some View {
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
        .padding(.vertical, 4)
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
