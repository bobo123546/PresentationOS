"""Design tokens defining typography, color palettes, spacing and canvas dimensions."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict


@dataclass
class ColorPalette:
    background: str
    surface: str
    surface_alt: str
    text_primary: str
    text_secondary: str
    text_muted: str
    accent: str
    accent_secondary: str
    card_border: str

    def to_dict(self) -> Dict[str, str]:
        return {
            "background": self.background,
            "surface": self.surface,
            "surface_alt": self.surface_alt,
            "text_primary": self.text_primary,
            "text_secondary": self.text_secondary,
            "text_muted": self.text_muted,
            "accent": self.accent,
            "accent_secondary": self.accent_secondary,
            "card_border": self.card_border,
        }


@dataclass
class TypographyTokens:
    heading_font: str
    body_font: str
    code_font: str
    font_sizes: Dict[str, float] = field(
        default_factory=lambda: {
            "hero_title": 48.0,
            "title": 36.0,
            "subtitle": 20.0,
            "section": 24.0,
            "card_title": 20.0,
            "body": 16.0,
            "metric_value": 44.0,
            "metric_label": 14.0,
            "caption": 12.0,
        }
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "heading_font": self.heading_font,
            "body_font": self.body_font,
            "code_font": self.code_font,
            "font_sizes": self.font_sizes,
        }


@dataclass
class CanvasTokens:
    width: float = 1920.0
    height: float = 1080.0
    aspect_ratio: str = "16:9"
    margin_x: float = 80.0
    margin_y: float = 60.0
    content_width: float = 1760.0
    content_height: float = 960.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "width": self.width,
            "height": self.height,
            "aspect_ratio": self.aspect_ratio,
            "margin_x": self.margin_x,
            "margin_y": self.margin_y,
            "content_width": self.content_width,
            "content_height": self.content_height,
        }


@dataclass
class DesignTokens:
    theme_name: str
    colors: ColorPalette
    typography: TypographyTokens
    canvas: CanvasTokens = field(default_factory=CanvasTokens)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "theme_name": self.theme_name,
            "colors": self.colors.to_dict(),
            "typography": self.typography.to_dict(),
            "canvas": self.canvas.to_dict(),
        }


THEMES: Dict[str, DesignTokens] = {
    "tech_dark": DesignTokens(
        theme_name="tech_dark",
        colors=ColorPalette(
            background="#0A0F1D",
            surface="#151E33",
            surface_alt="#1E293B",
            text_primary="#F8FAFC",
            text_secondary="#94A3B8",
            text_muted="#64748B",
            accent="#38BDF8",  # Cyber sky blue
            accent_secondary="#818CF8",  # Indigo
            card_border="#334155",
        ),
        typography=TypographyTokens(
            heading_font="Microsoft YaHei",
            body_font="Segoe UI",
            code_font="Consolas",
        ),
    ),
    "corporate_light": DesignTokens(
        theme_name="corporate_light",
        colors=ColorPalette(
            background="#FFFFFF",
            surface="#F8FAFC",
            surface_alt="#F1F5F9",
            text_primary="#0F172A",
            text_secondary="#475569",
            text_muted="#94A3B8",
            accent="#1E40AF",  # Royal Blue
            accent_secondary="#0284C7",  # Cerulean
            card_border="#E2E8F0",
        ),
        typography=TypographyTokens(
            heading_font="Microsoft YaHei",
            body_font="Calibri",
            code_font="Consolas",
        ),
    ),
    "minimal_warm": DesignTokens(
        theme_name="minimal_warm",
        colors=ColorPalette(
            background="#FAF9F6",
            surface="#FFFFFF",
            surface_alt="#F3EFEA",
            text_primary="#18181B",
            text_secondary="#52525B",
            text_muted="#A1A1AA",
            accent="#B45309",  # Bronze Amber
            accent_secondary="#D97706",
            card_border="#E4E4E7",
        ),
        typography=TypographyTokens(
            heading_font="Microsoft YaHei",
            body_font="Segoe UI",
            code_font="Consolas",
        ),
    ),
    "emerald_nature": DesignTokens(
        theme_name="emerald_nature",
        colors=ColorPalette(
            background="#F0FDF4",
            surface="#FFFFFF",
            surface_alt="#DCFCE7",
            text_primary="#064E3B",
            text_secondary="#047857",
            text_muted="#6EE7B7",
            accent="#059669",  # Emerald
            accent_secondary="#0284C7",
            card_border="#A7F3D0",
        ),
        typography=TypographyTokens(
            heading_font="Microsoft YaHei",
            body_font="Calibri",
            code_font="Consolas",
        ),
    ),
}


def get_theme(theme_name: str = "tech_dark") -> DesignTokens:
    """Returns requested design token set, falling back to tech_dark."""
    return THEMES.get(theme_name, THEMES["tech_dark"])
