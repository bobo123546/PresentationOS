"""Layout solver computing deterministic, collision-free ResolvedScenes."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from core.resolved_scene import (
    BoundingBox,
    ResolvedNode,
    ResolvedScene,
    ResolvedSlide,
    estimate_text_bounds,
)
from design.design_tokens import DesignTokens, get_theme
from narrative.narrative_planner import NarrativeDeck, NarrativeSlide


class LayoutSolver:
    """Computes exact coordinate geometry from NarrativeDeck and DesignTokens."""

    def __init__(self, theme: Optional[DesignTokens] = None) -> None:
        self.theme = theme or get_theme("tech_dark")
        self.canvas_w = self.theme.canvas.width
        self.canvas_h = self.theme.canvas.height
        self.margin_x = self.theme.canvas.margin_x
        self.margin_y = self.theme.canvas.margin_y
        self.content_w = self.canvas_w - 2 * self.margin_x
        self.content_h = self.canvas_h - 2 * self.margin_y

    def solve_deck(self, narrative_deck: NarrativeDeck) -> ResolvedScene:
        """Solves layout for an entire narrative deck."""
        resolved_slides: List[ResolvedSlide] = []

        for slide in narrative_deck.slides:
            r_slide = self.solve_slide(slide)
            resolved_slides.append(r_slide)

        return ResolvedScene(
            scene_id=f"scene_{narrative_deck.narrative_id}",
            canvas_width=self.canvas_w,
            canvas_height=self.canvas_h,
            slides=resolved_slides,
            metadata={
                "theme": self.theme.theme_name,
                "title": narrative_deck.title,
                "objective": narrative_deck.objective,
            },
        )

    def solve_slide(self, slide: NarrativeSlide) -> ResolvedSlide:
        """Solves coordinate positions for a single slide based on layout_type."""
        layout = slide.layout_type
        nodes: List[ResolvedNode] = []

        # Always add background node
        bg_node = ResolvedNode(
            node_id=f"bg_{slide.slide_index}",
            node_type="container",
            bounds=BoundingBox(0, 0, self.canvas_w, self.canvas_h),
            text="",
            font_size=0,
            fill_color=self.theme.colors.background,
            z_index=0,
        )
        nodes.append(bg_node)

        if layout == "title_slide":
            nodes.extend(self._layout_title_slide(slide))
        elif layout == "agenda":
            nodes.extend(self._layout_agenda_slide(slide))
        elif layout == "big_metric":
            nodes.extend(self._layout_metric_slide(slide))
        elif layout == "data_table":
            nodes.extend(self._layout_table_slide(slide))
        elif layout == "conclusion":
            nodes.extend(self._layout_conclusion_slide(slide))
        else:
            # Default to cards_grid / general content
            nodes.extend(self._layout_cards_slide(slide))

        if slide.source_chunk_ids:
            for node in nodes:
                if node.node_id.startswith(('card_desc_', 'm_bullets_txt_', 'tbl_td_txt_', 'tbl_th_txt_')):
                    node.source_id = slide.source_chunk_ids[0]
        return ResolvedSlide(
            slide_id=f"slide_{slide.slide_index:03d}",
            slide_index=slide.slide_index,
            layout_type=layout,
            title=slide.title,
            nodes=nodes,
            speaker_notes=slide.speaker_notes,
        )

    def _layout_title_slide(self, slide: NarrativeSlide) -> List[ResolvedNode]:
        nodes: List[ResolvedNode] = []

        # Accent top decorative bar
        nodes.append(
            ResolvedNode(
                node_id=f"bar_{slide.slide_index}",
                node_type="shape",
                bounds=BoundingBox(self.margin_x, self.margin_y + 100, 120, 8),
                fill_color=self.theme.colors.accent,
                z_index=1,
            )
        )

        # Title text
        title_font_size = self.theme.typography.font_sizes["hero_title"]
        nodes.append(
            ResolvedNode(
                node_id=f"title_{slide.slide_index}",
                node_type="text",
                bounds=BoundingBox(self.margin_x, self.margin_y + 140, self.content_w, 160),
                text=slide.title,
                font_family=self.theme.typography.heading_font,
                font_size=title_font_size,
                font_color=self.theme.colors.text_primary,
                z_index=2,
            )
        )

        # Subtitle
        sub_font_size = self.theme.typography.font_sizes["subtitle"]
        sub_text = slide.subtitle or "PresentationOS Technical Architecture Specification"
        nodes.append(
            ResolvedNode(
                node_id=f"subtitle_{slide.slide_index}",
                node_type="text",
                bounds=BoundingBox(self.margin_x, self.margin_y + 320, self.content_w, 80),
                text=sub_text,
                font_family=self.theme.typography.body_font,
                font_size=sub_font_size,
                font_color=self.theme.colors.accent,
                z_index=2,
            )
        )

        # Bottom metadata badge
        nodes.append(
            ResolvedNode(
                node_id=f"badge_{slide.slide_index}",
                node_type="container",
                bounds=BoundingBox(self.margin_x, self.canvas_h - self.margin_y - 80, 420, 48),
                fill_color=self.theme.colors.surface,
                border_color=self.theme.colors.card_border,
                z_index=1,
            )
        )
        nodes.append(
            ResolvedNode(
                node_id=f"badge_txt_{slide.slide_index}",
                node_type="text",
                bounds=BoundingBox(self.margin_x + 20, self.canvas_h - self.margin_y - 70, 380, 30),
                text="PRESENTATIONOS DEVELOPER PREVIEW",
                font_family=self.theme.typography.code_font,
                font_size=12,
                font_color=self.theme.colors.text_secondary,
                z_index=2,
            )
        )

        return nodes

    def _layout_header(self, slide: NarrativeSlide) -> List[ResolvedNode]:
        """Standard slide header (Title + Subtitle + Category)."""
        nodes: List[ResolvedNode] = []

        # Category / Mini tag
        nodes.append(
            ResolvedNode(
                node_id=f"cat_{slide.slide_index}",
                node_type="text",
                bounds=BoundingBox(self.margin_x, self.margin_y, 400, 24),
                text="PRESENTATIONOS // ARCHITECTURE",
                font_family=self.theme.typography.code_font,
                font_size=12,
                font_color=self.theme.colors.accent,
                z_index=1,
            )
        )

        # Main Title
        title_font_size = self.theme.typography.font_sizes["title"]
        nodes.append(
            ResolvedNode(
                node_id=f"hdr_title_{slide.slide_index}",
                node_type="text",
                bounds=BoundingBox(self.margin_x, self.margin_y + 30, self.content_w, 60),
                text=slide.title,
                font_family=self.theme.typography.heading_font,
                font_size=title_font_size,
                font_color=self.theme.colors.text_primary,
                z_index=2,
            )
        )

        # Subtitle
        if slide.subtitle:
            nodes.append(
                ResolvedNode(
                    node_id=f"hdr_sub_{slide.slide_index}",
                    node_type="text",
                    bounds=BoundingBox(self.margin_x, self.margin_y + 95, self.content_w, 32),
                    text=slide.subtitle,
                    font_family=self.theme.typography.body_font,
                    font_size=self.theme.typography.font_sizes["subtitle"],
                    font_color=self.theme.colors.text_secondary,
                    z_index=2,
                )
            )

        return nodes

    def _layout_agenda_slide(self, slide: NarrativeSlide) -> List[ResolvedNode]:
        nodes = self._layout_header(slide)
        start_y = self.margin_y + 160
        total_items = max(len(slide.bullets), 1)
        item_h = min(100.0, (self.content_h - 180) / total_items)
        gap = 16.0

        for idx, item in enumerate(slide.bullets):
            cur_y = start_y + idx * (item_h + gap)

            # Agenda row container
            nodes.append(
                ResolvedNode(
                    node_id=f"ag_box_{slide.slide_index}_{idx}",
                    node_type="container",
                    bounds=BoundingBox(self.margin_x, cur_y, self.content_w, item_h),
                    fill_color=self.theme.colors.surface,
                    border_color=self.theme.colors.card_border,
                    z_index=1,
                )
            )

            # Step number badge
            nodes.append(
                ResolvedNode(
                    node_id=f"ag_num_{slide.slide_index}_{idx}",
                    node_type="shape",
                    bounds=BoundingBox(self.margin_x + 24, cur_y + (item_h - 44) / 2, 44, 44),
                    fill_color=self.theme.colors.accent,
                    z_index=2,
                )
            )
            nodes.append(
                ResolvedNode(
                    node_id=f"ag_num_txt_{slide.slide_index}_{idx}",
                    node_type="text",
                    bounds=BoundingBox(self.margin_x + 24, cur_y + (item_h - 36) / 2, 44, 36),
                    text=f"{idx+1:02d}",
                    font_family=self.theme.typography.code_font,
                    font_size=18,
                    font_color="#FFFFFF",
                    z_index=3,
                )
            )

            # Agenda text
            nodes.append(
                ResolvedNode(
                    node_id=f"ag_txt_{slide.slide_index}_{idx}",
                    node_type="text",
                    bounds=BoundingBox(self.margin_x + 90, cur_y + (item_h - 40) / 2, self.content_w - 120, 40),
                    text=item,
                    font_family=self.theme.typography.heading_font,
                    font_size=self.theme.typography.font_sizes["section"],
                    font_color=self.theme.colors.text_primary,
                    z_index=2,
                )
            )

        return nodes

    def _layout_metric_slide(self, slide: NarrativeSlide) -> List[ResolvedNode]:
        nodes = self._layout_header(slide)
        start_y = self.margin_y + 160
        metrics = slide.metrics or [{"value": "100%", "label": "指标事实"}]

        # Left / Top metrics grid (supports up to 4 metrics)
        num_cols = min(len(metrics), 4)
        gap = 24.0
        col_w = (self.content_w - (num_cols - 1) * gap) / num_cols
        card_h = 240.0

        for idx, m in enumerate(metrics[:num_cols]):
            cur_x = self.margin_x + idx * (col_w + gap)

            # Metric card container
            nodes.append(
                ResolvedNode(
                    node_id=f"m_card_{slide.slide_index}_{idx}",
                    node_type="container",
                    bounds=BoundingBox(cur_x, start_y, col_w, card_h),
                    fill_color=self.theme.colors.surface,
                    border_color=self.theme.colors.card_border,
                    z_index=1,
                )
            )

            # Metric value
            nodes.append(
                ResolvedNode(
                    node_id=f"m_val_{slide.slide_index}_{idx}",
                    node_type="text",
                    bounds=BoundingBox(cur_x + 24, start_y + 36, col_w - 48, 80),
                    text=m.get("value", ""),
                    font_family=self.theme.typography.heading_font,
                    font_size=self.theme.typography.font_sizes["metric_value"],
                    font_color=self.theme.colors.accent,
                    z_index=2,
                )
            )

            # Metric label
            nodes.append(
                ResolvedNode(
                    node_id=f"m_lbl_{slide.slide_index}_{idx}",
                    node_type="text",
                    bounds=BoundingBox(cur_x + 24, start_y + 128, col_w - 48, 60),
                    text=m.get("label", ""),
                    font_family=self.theme.typography.body_font,
                    font_size=self.theme.typography.font_sizes["section"],
                    font_color=self.theme.colors.text_secondary,
                    z_index=2,
                )
            )

        # Bottom bullet description cards if available
        if slide.bullets:
            bullet_y = start_y + card_h + 30
            bullet_box_h = max(120.0, (self.canvas_h - self.margin_y - bullet_y))
            nodes.append(
                ResolvedNode(
                    node_id=f"m_bullets_box_{slide.slide_index}",
                    node_type="container",
                    bounds=BoundingBox(self.margin_x, bullet_y, self.content_w, bullet_box_h),
                    fill_color=self.theme.colors.surface_alt,
                    border_color=self.theme.colors.card_border,
                    z_index=1,
                )
            )
            bullet_text = "\n".join([f"• {b}" for b in slide.bullets])
            nodes.append(
                ResolvedNode(
                    node_id=f"m_bullets_txt_{slide.slide_index}",
                    node_type="text",
                    bounds=BoundingBox(self.margin_x + 24, bullet_y + 20, self.content_w - 48, bullet_box_h - 40),
                    text=bullet_text,
                    font_family=self.theme.typography.body_font,
                    font_size=self.theme.typography.font_sizes["body"],
                    font_color=self.theme.colors.text_primary,
                    z_index=2,
                )
            )

        return nodes

    def _layout_cards_slide(self, slide: NarrativeSlide) -> List[ResolvedNode]:
        nodes = self._layout_header(slide)
        start_y = self.margin_y + 160
        cards = slide.cards or [{"title": slide.title, "description": "\n".join(slide.bullets)}]

        num_cards = min(len(cards), 4)
        gap = 24.0
        card_w = (self.content_w - (num_cards - 1) * gap) / num_cards
        card_h = self.content_h - 180

        for idx, card in enumerate(cards[:num_cards]):
            cur_x = self.margin_x + idx * (card_w + gap)

            # Card container
            nodes.append(
                ResolvedNode(
                    node_id=f"card_{slide.slide_index}_{idx}",
                    node_type="container",
                    bounds=BoundingBox(cur_x, start_y, card_w, card_h),
                    fill_color=self.theme.colors.surface,
                    border_color=self.theme.colors.card_border,
                    z_index=1,
                )
            )

            # Top accent bar on card
            nodes.append(
                ResolvedNode(
                    node_id=f"card_bar_{slide.slide_index}_{idx}",
                    node_type="shape",
                    bounds=BoundingBox(cur_x, start_y, card_w, 6),
                    fill_color=self.theme.colors.accent if idx == 0 else self.theme.colors.accent_secondary,
                    z_index=2,
                )
            )

            # Card title
            nodes.append(
                ResolvedNode(
                    node_id=f"card_title_{slide.slide_index}_{idx}",
                    node_type="text",
                    bounds=BoundingBox(cur_x + 24, start_y + 30, card_w - 48, 60),
                    text=card.get("title", f"模块 {idx+1}"),
                    font_family=self.theme.typography.heading_font,
                    font_size=self.theme.typography.font_sizes["card_title"],
                    font_color=self.theme.colors.text_primary,
                    z_index=3,
                )
            )

            # Card description
            nodes.append(
                ResolvedNode(
                    node_id=f"card_desc_{slide.slide_index}_{idx}",
                    node_type="text",
                    bounds=BoundingBox(cur_x + 24, start_y + 100, card_w - 48, card_h - 130),
                    text=card.get("description", ""),
                    font_family=self.theme.typography.body_font,
                    font_size=self.theme.typography.font_sizes["body"],
                    font_color=self.theme.colors.text_secondary,
                    z_index=3,
                )
            )

        return nodes

    def _layout_table_slide(self, slide: NarrativeSlide) -> List[ResolvedNode]:
        nodes = self._layout_header(slide)
        start_y = self.margin_y + 160
        table_data = slide.table_data or {"headers": ["项目", "状态"], "rows": [["示例项", "正常"]]}
        headers = table_data.get("headers", [])
        rows = table_data.get("rows", [])

        num_cols = max(len(headers), 1)
        col_w = self.content_w / num_cols
        if len(rows) > 6 or any(len(row) > len(headers) for row in rows):
            raise ValueError("Table must be paginated before layout; refusing to drop cells")
        row_h = 56.0

        # Header row
        for c_idx, h_text in enumerate(headers):
            c_x = self.margin_x + c_idx * col_w
            nodes.append(
                ResolvedNode(
                    node_id=f"tbl_th_bg_{slide.slide_index}_{c_idx}",
                    node_type="container",
                    bounds=BoundingBox(c_x, start_y, col_w, row_h),
                    fill_color=self.theme.colors.surface_alt,
                    border_color=self.theme.colors.card_border,
                    z_index=1,
                )
            )
            nodes.append(
                ResolvedNode(
                    node_id=f"tbl_th_txt_{slide.slide_index}_{c_idx}",
                    node_type="text",
                    bounds=BoundingBox(c_x + 12, start_y + 12, col_w - 24, row_h - 24),
                    text=h_text,
                    font_family=self.theme.typography.heading_font,
                    font_size=self.theme.typography.font_sizes["section"],
                    font_color=self.theme.colors.accent,
                    z_index=2,
                )
            )

        # Data rows
        for r_idx, row in enumerate(rows):
            r_y = start_y + (r_idx + 1) * row_h
            bg_col = self.theme.colors.surface if r_idx % 2 == 0 else self.theme.colors.surface_alt
            for c_idx, val in enumerate(row):
                c_x = self.margin_x + c_idx * col_w
                nodes.append(
                    ResolvedNode(
                        node_id=f"tbl_td_bg_{slide.slide_index}_{r_idx}_{c_idx}",
                        node_type="container",
                        bounds=BoundingBox(c_x, r_y, col_w, row_h),
                        fill_color=bg_col,
                        border_color=self.theme.colors.card_border,
                        z_index=1,
                    )
                )
                nodes.append(
                    ResolvedNode(
                        node_id=f"tbl_td_txt_{slide.slide_index}_{r_idx}_{c_idx}",
                        node_type="text",
                        bounds=BoundingBox(c_x + 12, r_y + 14, col_w - 24, row_h - 28),
                        text=str(val),
                        font_family=self.theme.typography.body_font,
                        font_size=self.theme.typography.font_sizes["body"],
                        font_color=self.theme.colors.text_primary,
                        z_index=2,
                    )
                )

        return nodes

    def _layout_conclusion_slide(self, slide: NarrativeSlide) -> List[ResolvedNode]:
        nodes = self._layout_header(slide)
        start_y = self.margin_y + 160
        box_h = self.content_h - 180

        # Central conclusion box
        nodes.append(
            ResolvedNode(
                node_id=f"conc_box_{slide.slide_index}",
                node_type="container",
                bounds=BoundingBox(self.margin_x, start_y, self.content_w, box_h),
                fill_color=self.theme.colors.surface,
                border_color=self.theme.colors.card_border,
                z_index=1,
            )
        )

        # Bullet list items inside conclusion
        bullets = slide.bullets or ["技术方案落地", "全链路质检保障", "感谢聆听"]
        item_gap = 70.0
        for b_idx, bullet in enumerate(bullets[:4]):
            b_y = start_y + 50 + b_idx * item_gap

            # Bullet dot
            nodes.append(
                ResolvedNode(
                    node_id=f"conc_dot_{slide.slide_index}_{b_idx}",
                    node_type="shape",
                    bounds=BoundingBox(self.margin_x + 40, b_y + 8, 16, 16),
                    fill_color=self.theme.colors.accent,
                    z_index=2,
                )
            )

            # Bullet text
            nodes.append(
                ResolvedNode(
                    node_id=f"conc_txt_{slide.slide_index}_{b_idx}",
                    node_type="text",
                    bounds=BoundingBox(self.margin_x + 76, b_y, self.content_w - 120, 48),
                    text=bullet,
                    font_family=self.theme.typography.heading_font,
                    font_size=self.theme.typography.font_sizes["section"],
                    font_color=self.theme.colors.text_primary,
                    z_index=2,
                )
            )

        return nodes
