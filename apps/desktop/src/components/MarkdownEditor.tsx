import React from 'react';
import { SlideItem } from '../types.js';
import type { LocalImportFile } from '../import-assets.js';

interface MarkdownEditorProps {
  markdown: string;
  onMarkdownChange: (md: string) => void;
  onImport: () => void;
  slides: SlideItem[];
  selectedIndex: number;
  onSelectSlide: (index: number) => void;
  disabled?: boolean;
  onImportDocument: (file: LocalImportFile) => Promise<void>;
  onImportReference: (file: LocalImportFile) => Promise<void>;
  onClearReference: () => void;
  sourceFilename?: string;
  referenceFilename?: string;
  busyOperation?: string | null;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  markdown,
  onMarkdownChange,
  onImport,
  slides,
  selectedIndex,
  onSelectSlide,
  disabled,
  onImportDocument,
  onImportReference,
  onClearReference,
  sourceFilename,
  referenceFilename,
  busyOperation,
}) => {
  const pageSize = 40;
  const pageStart = Math.floor(selectedIndex / pageSize) * pageSize;
  const pageEnd = Math.min(slides.length, pageStart + pageSize);
  const importFile = (handler: (file: LocalImportFile) => Promise<void>) => async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) await handler(file);
  };
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
        <fieldset className="asset-imports" disabled={disabled} aria-busy={Boolean(busyOperation)}>
          <legend>导入素材</legend>
          <label htmlFor="ImportDocumentInput">导入文档</label>
          <p id="DocumentImportHelp" className="asset-help">Markdown / TXT / DOCX / CSV / TSV / XLSX，每个文件最多 16 MiB。</p>
          <input id="ImportDocumentInput" name="document" data-automation-id="ImportDocumentInput" type="file"
            accept=".md,.markdown,.txt,.docx,.csv,.tsv,.xlsx" aria-describedby="DocumentImportHelp"
            onChange={importFile(onImportDocument)} />
          <p className="asset-status">{sourceFilename ? `原始文档：${sourceFilename}` : '生成来源：当前 Markdown'}</p>
          <label htmlFor="ReferenceTemplateInput">参考 PPTX</label>
          <p id="ReferenceTemplateHelp" className="asset-help">应用主题配色与字体；母版、复杂版式和图片不会被完整复刻。最多 16 MiB。</p>
          <input id="ReferenceTemplateInput" name="referenceTemplate" data-automation-id="ReferenceTemplateInput" type="file"
            accept=".pptx" aria-describedby="ReferenceTemplateHelp" onChange={importFile(onImportReference)} />
          {referenceFilename && <div className="asset-reference"><span className="asset-status">{referenceFilename}</span>
            <button id="ClearReferenceTemplateBtn" data-automation-id="ClearReferenceTemplateBtn" type="button" className="btn" onClick={onClearReference}>移除参考</button></div>}
          {busyOperation?.startsWith('import-') && <p className="asset-help">正在校验并导入；原文在成功前保持不变。</p>}
        </fieldset>
        <label htmlFor="MarkdownEditorInput" className="form-label">可编辑 Markdown 源文</label>
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
          <span className="panel-title">源文章节 ({slides.length}) · 导出时自动分页</span>
        </div>

        {slides.length > pageSize && <form className="outline-pagination" onSubmit={event => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem('chapter') as HTMLInputElement;
          if (!disabled && input.checkValidity()) onSelectSlide(Number(input.value) - 1);
        }}>
          <div className="outline-page-buttons">
            <button type="button" className="btn" id="PreviousOutlinePageBtn" disabled={disabled || pageStart === 0}
              onClick={() => onSelectSlide(Math.max(0, selectedIndex - pageSize))}>上一组</button>
            <span>{pageStart + 1}–{pageEnd} / {slides.length}</span>
            <button type="button" className="btn" id="NextOutlinePageBtn" disabled={disabled || pageEnd >= slides.length}
              onClick={() => onSelectSlide(Math.min(slides.length - 1, selectedIndex + pageSize))}>下一组</button>
          </div>
          <div className="outline-jump">
            <label htmlFor="OutlineChapterInput">跳至章节</label>
            <input key={selectedIndex} id="OutlineChapterInput" name="chapter" type="number" min="1" max={slides.length}
              required defaultValue={selectedIndex + 1} disabled={disabled} />
            <button type="submit" className="btn" disabled={disabled}>跳转</button>
          </div>
        </form>}
        <nav
          id="SlideNavList"
          data-testid="SlideNavList"
          data-automation-id="SlideNavList"
          aria-label="Slide Navigation List"
          className="slide-nav-list"
        >
          {slides.slice(pageStart, pageEnd).map((s, offset) => {
            const idx = pageStart + offset;
            return (
            <button
              key={s.id || idx}
              id={`SlideNavItem_${idx}`}
              data-testid={`SlideNavItem_${idx}`}
              data-automation-id={`SlideNavItem_${idx}`}
              aria-label={`Slide ${idx + 1}: ${s.title}`}
              aria-pressed={idx === selectedIndex}
              disabled={disabled}
              className={`slide-nav-item ${idx === selectedIndex ? 'active' : ''}`}
              onClick={() => onSelectSlide(idx)}
            >
              <span>{idx + 1}. {s.title || '无标题幻灯片'}</span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>{s.layout}</span>
            </button>
          ); })}
        </nav>
      </div>
    </div>
  );
};
