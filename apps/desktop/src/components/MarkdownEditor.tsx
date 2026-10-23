import React from 'react';
import { SlideItem } from '../types.js';

interface MarkdownEditorProps {
  markdown: string;
  onMarkdownChange: (md: string) => void;
  onImport: () => void;
  slides: SlideItem[];
  selectedIndex: number;
  onSelectSlide: (index: number) => void;
  disabled?: boolean;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  markdown,
  onMarkdownChange,
  onImport,
  slides,
  selectedIndex,
  onSelectSlide,
  disabled,
}) => {
  return (
    <div className="panel panel-left">
      <div className="panel-header">
        <span className="panel-title">文档与大纲 (Markdown)</span>
        <button
          id="ImportMarkdownBtn"
          data-testid="ImportMarkdownBtn"
          data-automation-id="ImportMarkdownBtn"
          aria-label="Import Markdown"
          className="btn"
          disabled={disabled}
          onClick={onImport}
        >
          解析大纲
        </button>
      </div>

      <div className="panel-content">
        <textarea
          id="MarkdownEditorInput"
          data-testid="MarkdownEditorInput"
          data-automation-id="MarkdownEditorInput"
          aria-label="Markdown Editor Input"
          className="markdown-textarea"
          value={markdown}
          disabled={disabled}
          onChange={(e) => onMarkdownChange(e.target.value)}
          placeholder="# 演示标题\n\n## 幻灯片 1\n- 要点一\n- 要点二\n\n## 幻灯片 2\n- 要点三"
        />

        <div className="panel-header" style={{ padding: '6px 0', border: 'none', background: 'transparent' }}>
          <span className="panel-title">幻灯片导航 ({slides.length})</span>
        </div>

        <div
          id="SlideNavList"
          data-testid="SlideNavList"
          data-automation-id="SlideNavList"
          aria-label="Slide Navigation List"
          className="slide-nav-list"
        >
          {slides.map((s, idx) => (
            <div
              key={s.id || idx}
              id={`SlideNavItem_${idx}`}
              data-testid={`SlideNavItem_${idx}`}
              data-automation-id={`SlideNavItem_${idx}`}
              aria-label={`Slide ${idx + 1}: ${s.title}`}
              className={`slide-nav-item ${idx === selectedIndex ? 'active' : ''}`}
              onClick={() => onSelectSlide(idx)}
            >
              <span>{idx + 1}. {s.title || '无标题幻灯片'}</span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>{s.layout}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
