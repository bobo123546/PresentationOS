"""
Unified ResolvedScene Engine.
Acts as the single geometric, typographic, and stylistic source of truth
consumed by Layout, Renderer, Mechanical QA, and Visual QA.
"""
from __future__ import annotations
import math
from enum import Enum
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field, asdict


class RenderStatus(str, Enum):
    SUPPORTED = "SUPPORTED"
    DEGRADED = "DEGRADED"
    UNSUPPORTED = "UNSUPPORTED"


@dataclass
class BoundingBox:
    x: float
    y: float
    w: float
    h: float

    @property
    def width(self) -> float:
        return self.w

    @width.setter
    def width(self, val: float) -> None:
        self.w = val

    @property
    def height(self) -> float:
        return self.h

    @height.setter
    def height(self, val: float) -> None:
        self.h = val

    def right(self) -> float:
        return self.x + self.w

    def bottom(self) -> float:
        return self.y + self.h

    def overlaps(self, other: BoundingBox, margin: float = 0.0) -> bool:
        """Check if two boxes intersect with an optional tolerance margin."""
        if (self.right() - margin <= other.x + margin or
            other.right() - margin <= self.x + margin or
            self.bottom() - margin <= other.y + margin or
            other.bottom() - margin <= self.y + margin):
            return False
        return True

    def is_valid(self) -> bool:
        """Check for non-negative coordinates and positive dimensions."""
        return self.x >= 0 and self.y >= 0 and self.w > 0 and self.h > 0


@dataclass
class TextStyle:
    font_family: str = "Calibri"
    font_size: float = 14.0
    color: str = "#000000"
    line_height: float = 1.2
    align: str = "left"
    bold: bool = False
    italic: bool = False


@dataclass
class ResolvedElement:
    element_id: str = ""
    kind: str = "shape"  # text, image, shape, table, chart, svg, container
    box: BoundingBox = field(default_factory=lambda: BoundingBox(0, 0, 100, 100))
    style: TextStyle = field(default_factory=TextStyle)
    content: Any = ""
    source_id: Optional[str] = None
    z_index: int = 0
    render_status: RenderStatus = RenderStatus.SUPPORTED
    degrade_reason: Optional[str] = None
    fill_color: Optional[str] = None
    border_color: Optional[str] = None

    def __init__(
        self,
        element_id: str = "",
        kind: str = "shape",
        box: Optional[BoundingBox] = None,
        style: Optional[TextStyle] = None,
        content: Any = "",
        source_id: Optional[str] = None,
        z_index: int = 0,
        render_status: RenderStatus = RenderStatus.SUPPORTED,
        degrade_reason: Optional[str] = None,
        fill_color: Optional[str] = None,
        border_color: Optional[str] = None,
        # Keyword aliases
        node_id: Optional[str] = None,
        node_type: Optional[str] = None,
        bounds: Optional[BoundingBox] = None,
        text: Optional[str] = None,
        font_family: Optional[str] = None,
        font_size: Optional[float] = None,
        font_color: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        self.element_id = node_id or element_id
        self.kind = node_type or kind
        self.box = bounds or box or BoundingBox(0, 0, 100, 100)
        
        if style:
            self.style = style
        else:
            self.style = TextStyle(
                font_family=font_family or "Microsoft YaHei",
                font_size=font_size if font_size is not None else 14.0,
                color=font_color or "#000000",
            )
            
        self.content = text if text is not None else content
        self.source_id = source_id
        self.z_index = z_index
        self.render_status = render_status
        self.degrade_reason = degrade_reason
        self.fill_color = fill_color
        self.border_color = border_color

    # Compatibility properties for node naming
    @property
    def node_id(self) -> str:
        return self.element_id

    @property
    def node_type(self) -> str:
        return self.kind

    @property
    def bounds(self) -> BoundingBox:
        return self.box

    @property
    def text(self) -> str:
        return str(self.content) if self.content else ""

    @property
    def font_size(self) -> float:
        return self.style.font_size

    @property
    def font_family(self) -> str:
        return self.style.font_family

    @property
    def font_color(self) -> str:
        return self.style.color

    def estimate_text_bounds(self) -> BoundingBox:
        """
        Estimate rendered text dimensions considering CJK double-width characters
        and Latin proportional scaling.
        """
        if self.kind != "text" or not isinstance(self.content, str):
            return self.box

        lines = self.content.split("\n")
        max_line_width = 0.0
        total_height = 0.0

        char_height = self.style.font_size * self.style.line_height

        for line in lines:
            line_w = 0.0
            for ch in line:
                # CJK character width ~ 1.0em, ASCII ~ 0.55em
                if ord(ch) > 127:
                    line_w += self.style.font_size * 1.0
                else:
                    line_w += self.style.font_size * 0.55
            if line_w > max_line_width:
                max_line_width = line_w

        total_height = max(1, len(lines)) * char_height
        return BoundingBox(self.box.x, self.box.y, max_line_width, total_height)


# Alias ResolvedNode to ResolvedElement
ResolvedNode = ResolvedElement


def estimate_text_bounds(text: str, font_size: float = 14.0, line_height: float = 1.2) -> Tuple[float, float]:
    """Standalone helper estimating text width and height considering CJK double width."""
    lines = text.split("\n")
    max_line_width = 0.0
    for line in lines:
        line_w = 0.0
        for ch in line:
            if ord(ch) > 127:
                line_w += font_size * 1.0
            else:
                line_w += font_size * 0.55
        if line_w > max_line_width:
            max_line_width = line_w
    total_height = max(1, len(lines)) * font_size * line_height
    return max_line_width, total_height


@dataclass
class ResolvedSlide:
    slide_id: str
    slide_index: int
    elements: List[ResolvedElement] = field(default_factory=list)
    background_color: str = "#FFFFFF"
    speaker_notes: str = ""
    title: str = ""
    layout_type: str = "content"

    def __init__(
        self,
        slide_id: str,
        slide_index: int,
        elements: Optional[List[ResolvedElement]] = None,
        nodes: Optional[List[ResolvedElement]] = None,
        background_color: str = "#FFFFFF",
        speaker_notes: str = "",
        title: str = "",
        layout_type: str = "content",
    ) -> None:
        self.slide_id = slide_id
        self.slide_index = slide_index
        self.elements = nodes if nodes is not None else (elements or [])
        self.background_color = background_color
        self.speaker_notes = speaker_notes
        self.title = title
        self.layout_type = layout_type

    @property
    def nodes(self) -> List[ResolvedElement]:
        return self.elements

    def get_element(self, element_id: str) -> Optional[ResolvedElement]:
        for el in self.elements:
            if el.element_id == element_id:
                return el
        return None


@dataclass
class ResolvedScene:
    deck_id: str = "default_deck"
    slide_width: float = 960.0  # 16:9 standard pt (13.333 in)
    slide_height: float = 540.0  # 16:9 standard pt (7.5 in)
    safe_margin: Dict[str, float] = field(default_factory=lambda: {
        "top": 36.0, "bottom": 36.0, "left": 48.0, "right": 48.0
    })
    slides: List[ResolvedSlide] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __init__(
        self,
        deck_id: str = "default_deck",
        slide_width: Optional[float] = None,
        slide_height: Optional[float] = None,
        canvas_width: Optional[float] = None,
        canvas_height: Optional[float] = None,
        scene_id: Optional[str] = None,
        safe_margin: Optional[Dict[str, float]] = None,
        slides: Optional[List[ResolvedSlide]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.deck_id = scene_id or deck_id
        self.slide_width = canvas_width if canvas_width is not None else (slide_width or 960.0)
        self.slide_height = canvas_height if canvas_height is not None else (slide_height or 540.0)
        self.safe_margin = safe_margin or {"top": 36.0, "bottom": 36.0, "left": 48.0, "right": 48.0}
        self.slides = slides or []
        self.metadata = metadata or {}

    @property
    def canvas_width(self) -> float:
        return self.slide_width

    @property
    def canvas_height(self) -> float:
        return self.slide_height

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ResolvedScene:
        slides = []
        for s_data in data.get("slides", []):
            elements = []
            for e_data in s_data.get("elements", []):
                b_data = e_data.get("box", {})
                box = BoundingBox(
                    x=b_data.get("x", 0.0),
                    y=b_data.get("y", 0.0),
                    w=b_data.get("w", 100.0),
                    h=b_data.get("h", 100.0),
                )
                st_data = e_data.get("style", {})
                style = TextStyle(
                    font_family=st_data.get("font_family", "Calibri"),
                    font_size=st_data.get("font_size", 14.0),
                    color=st_data.get("color", "#000000"),
                )
                elements.append(ResolvedElement(
                    element_id=e_data.get("element_id", ""),
                    kind=e_data.get("kind", "shape"),
                    box=box,
                    style=style,
                    content=e_data.get("content", ""),
                    z_index=e_data.get("z_index", 0),
                    render_status=RenderStatus(e_data.get("render_status", "SUPPORTED")),
                    fill_color=e_data.get("fill_color"),
                    border_color=e_data.get("border_color"),
                ))
            slides.append(ResolvedSlide(
                slide_id=s_data.get("slide_id", ""),
                slide_index=s_data.get("slide_index", 0),
                elements=elements,
                background_color=s_data.get("background_color", "#FFFFFF"),
                speaker_notes=s_data.get("speaker_notes", ""),
                title=s_data.get("title", ""),
                layout_type=s_data.get("layout_type", "content"),
            ))
        return cls(
            deck_id=data.get("deck_id", "default_deck"),
            slide_width=data.get("slide_width", 960.0),
            slide_height=data.get("slide_height", 540.0),
            safe_margin=data.get("safe_margin", {"top": 36.0, "bottom": 36.0, "left": 48.0, "right": 48.0}),
            slides=slides,
            metadata=data.get("metadata", {}),
        )
