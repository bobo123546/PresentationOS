import React from 'react';
import { TaskEngineStatus } from '../types.js';

interface HeaderBarProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  status: TaskEngineStatus;
  hasPptx: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onCompile: () => void;
  onCancel: () => void;
  onExport: () => void;
  onReconstruct?: () => void;
  onMediaExport?: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  title,
  onTitleChange,
  status,
  hasPptx,
  onNew,
  onOpen,
  onSave,
  onCompile,
  onCancel,
  onExport,
  onReconstruct,
  onMediaExport,
}) => {
  const isRunning = status === 'RUNNING';

  return (
    <header className="header-bar">
      <div className="brand-section">
        <span className="brand-title">PresentationOS</span>
        <input
          id="ProjectTitleInput"
          data-testid="ProjectTitleInput"
          data-automation-id="ProjectTitleInput"
          aria-label="Project Title"
          type="text"
          className="project-title-input"
          value={title}
          disabled={isRunning}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="输入项目标题..."
        />
      </div>

      <div className="actions-section">
        <button
          id="NewProjectBtn"
          data-testid="NewProjectBtn"
          data-automation-id="NewProjectBtn"
          aria-label="New Project"
          className="btn"
          disabled={isRunning}
          onClick={onNew}
        >
          新建项目
        </button>

        <button
          id="OpenProjectBtn"
          data-testid="OpenProjectBtn"
          data-automation-id="OpenProjectBtn"
          aria-label="Open Project"
          className="btn"
          disabled={isRunning}
          onClick={onOpen}
        >
          打开项目
        </button>

        <button
          id="SaveProjectBtn"
          data-testid="SaveProjectBtn"
          data-automation-id="SaveProjectBtn"
          aria-label="Save Project"
          className="btn"
          disabled={isRunning}
          onClick={onSave}
        >
          保存项目
        </button>

        <button
          id="CompileDeckBtn"
          data-testid="CompileDeckBtn"
          data-automation-id="CompileDeckBtn"
          aria-label="Compile Deck"
          className="btn btn-primary"
          disabled={isRunning}
          onClick={onCompile}
        >
          {isRunning ? '生成中...' : '生成 PPTX'}
        </button>

        <button
          id="CancelTaskBtn"
          data-testid="CancelTaskBtn"
          data-automation-id="CancelTaskBtn"
          aria-label="Cancel Task"
          className="btn btn-danger"
          disabled={!isRunning}
          onClick={onCancel}
        >
          取消任务
        </button>

        <button
          id="ExportPptxBtn"
          data-testid="ExportPptxBtn"
          data-automation-id="ExportPptxBtn"
          aria-label="Export PPTX"
          className="btn"
          disabled={isRunning || !hasPptx}
          onClick={onExport}
        >
          导出文稿
        </button>

        <button
          id="ReconstructBtn"
          data-testid="ReconstructBtn"
          data-automation-id="ReconstructBtn"
          aria-label="Reconstruct Slide"
          className="btn"
          disabled={isRunning}
          onClick={onReconstruct}
        >
          参考图重建
        </button>

        <button
          id="MediaExportBtn"
          data-testid="MediaExportBtn"
          data-automation-id="MediaExportBtn"
          aria-label="Export Media Video"
          className="btn"
          disabled={isRunning}
          onClick={onMediaExport}
        >
          配音与视频
        </button>
      </div>
    </header>
  );
};
