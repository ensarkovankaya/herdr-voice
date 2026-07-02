// app/macos/Sources/HerdrVoiceBar/MenuStyle.swift
import AppKit

// Attributed-string and image builders for the menu's visual design (Variant B).
// All styling lives here so MenuBarController stays declarative. Explicit
// label/secondaryLabel colors keep display-only (disabled) rows readable
// instead of AppKit's disabled gray.
@MainActor
enum MenuStyle {
    // Two-line cell: 13 pt primary + 11 pt secondary, tail-truncated.
    static func twoLine(_ primary: String, _ secondary: String) -> NSAttributedString {
        let para = NSMutableParagraphStyle()
        para.lineBreakMode = .byTruncatingTail
        let out = NSMutableAttributedString(
            string: primary,
            attributes: [.font: NSFont.menuFont(ofSize: 13),
                         .foregroundColor: NSColor.labelColor,
                         .paragraphStyle: para])
        out.append(NSAttributedString(
            string: "\n" + secondary,
            attributes: [.font: NSFont.menuFont(ofSize: 11),
                         .foregroundColor: NSColor.secondaryLabelColor,
                         .paragraphStyle: para]))
        return out
    }

    // Single-line secondary text (remote row, empty state).
    static func secondary(_ text: String) -> NSAttributedString {
        NSAttributedString(string: text, attributes: [
            .font: NSFont.menuFont(ofSize: 11),
            .foregroundColor: NSColor.secondaryLabelColor])
    }

    // Small-caps gray section header (native on macOS 14+, styled fallback below).
    static func sectionHeader(_ title: String) -> NSMenuItem {
        if #available(macOS 14.0, *) {
            return NSMenuItem.sectionHeader(title: title)
        }
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.attributedTitle = NSAttributedString(
            string: title.uppercased(),
            attributes: [.font: NSFont.systemFont(ofSize: 11, weight: .semibold),
                         .foregroundColor: NSColor.secondaryLabelColor])
        item.isEnabled = false
        return item
    }

    // Template SF Symbol for action rows.
    static func symbol(_ name: String) -> NSImage? {
        let img = NSImage(systemSymbolName: name, accessibilityDescription: nil)?
            .withSymbolConfiguration(.init(pointSize: 13, weight: .regular))
        img?.isTemplate = true
        return img
    }

    // Solid color dot (replaces the emoji bullets / status glyphs).
    static func dot(_ color: NSColor, diameter: CGFloat = 9) -> NSImage {
        let size = NSSize(width: diameter, height: diameter)
        let img = NSImage(size: size)
        img.lockFocus()
        color.setFill()
        NSBezierPath(ovalIn: NSRect(origin: .zero, size: size)).fill()
        img.unlockFocus()
        img.isTemplate = false
        return img
    }
}
