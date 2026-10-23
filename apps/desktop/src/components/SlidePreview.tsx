import React from 'react';
import { SlideItem } from '../types.js';

interface SlidePreviewProps {
  slide: SlideItem | null;
  onUpdateSlide: (updated: Partial<SlideItem>) => void;
  disabled?: boolean;
}

export const SlidePreview: React.FC<SlidePreviewProps> = ({
  slide,
  onUpdateSlide,
  disabled,
}) => {
  if (!slide) {
    return (
      <div className="panel panel-center">
        <div style={{ marginTop: '40px', color: '#64748b', fontSize: '13px' }}>
          暂无选中的幻灯片，请导入或选择大纲中的幻灯片。
        </div>
      </div>
    );
  }

  const bulletsText = slide.bullets.join('\n');

  return (
    <div className="panel panel-center">
      {/* Visual Canvas Representation */}
      <div
        id="ActiveSlideView"
        data-testid="ActiveSlideView"
        data-automation-id="ActiveSlideView"
        aria-label="Active Slide View"
        className="slide-canvas-card"
      >
        <div className="canvas-title">{slide.title || '（请输入标题）'}</div>
        <ul className="canvas-bullet-list">
          {slide.bullets.length > 0 ? (
            slide.bullets.map((b, i) => (
              <li key={i} className="canvas-bullet-item">{b}</li>
            ))
          ) : (
            <li className="canvas-bullet-item" style={{ color: '#64748b' }}>（暂无正文要点）</li>
          )}
        </ul>
      </div>

      {/* Slide Properties Form */}
      <div className="slide-editor-form">
        <div className="form-group">
          <label className="form-label" htmlFor="SlideTitleInput">幻灯片标题</label>
          <input
            id="SlideTitleInput"
            data-testid="SlideTitleInput"
            data-automation-id="SlideTitleInput"
            aria-label="Slide Title Input"
            type="text"
            className="form-input"
            value={slide.title}
            disabled={disabled}
            onChange={(e) => onUpdateSlide({ title: e.target.value })}
            placeholder="输入幻灯片标题..."
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="SlideLayoutSelect">排版布局</label>
          <select
            id="SlideLayoutSelect"
            data-testid="SlideLayoutSelect"
            data-automation-id="SlideLayoutSelect"
            aria-label="Slide Layout Select"
            className="form-select"
            value={slide.layout}
            disabled={disabled}
            onChange={(e) => onUpdateSlide({ layout: e.target.value as any })}
          >
            <option value="title">封面大标题 (Title)</option>
            <option value="bullet_list">要点列表 (Bullet List)</option>
            <option value="two_column">双列对比 (Two Column)</option>
            <option value="big_stat">核心数据 (Big Stat)</option>
            <option value="quote">名言金句 (Quote)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="SlideBodyInput">正文要点（每行一条）</label>
          <textarea
            id="SlideBodyInput"
            data-testid="SlideBodyInput"
            data-automation-id="SlideBodyInput"
            aria-label="Slide Body Input"
            className="form-textarea"
            rows={4}
            value={bulletsText}
            disabled={disabled}
            onChange={(e) => onUpdateSlide({ bullets: e.target.value.split('\n').filter((l) => l.trim() !== '') })}
            placeholder="- 第一点\n- 第二点\n- 第三点"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="SlideNotesInput">演讲者备注 (Speaker Notes)</label>
          <input
            id="SlideNotesInput"
            data-testid="SlideNotesInput"
            data-automation-id="SlideNotesInput"
            aria-label="Slide Notes Input"
            type="text"
            className="form-input"
            value={slide.speakerNotes ?? ''}
            disabled={disabled}
            onChange={(e) => onUpdateSlide({ speakerNotes: e.target.value })}
            placeholder="输入针对本页的演讲者提示或解说词..."
          />
        </div>
      </div>
    </div>
  );
};
