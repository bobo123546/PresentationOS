import React from 'react';
import { CompilationState } from '../types.js';

interface StatusBarProps {
  compilation: CompilationState;
  projectPath: string | null;
  toast: string | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  compilation,
  projectPath,
  toast,
}) => {
  const { status, runId, progressPercent, message } = compilation;

  return (
    <footer className="status-bar">
      <div className="status-left">
        <span
          id="StatusLabel"
          data-testid="StatusLabel"
          data-automation-id="StatusLabel"
          aria-label={`System Status: ${status}`}
          className={`status-badge ${status}`}
        >
          {status}
        </span>

        {status === 'RUNNING' && (
          <div
            id="TaskProgressBar"
            data-testid="TaskProgressBar"
            data-automation-id="TaskProgressBar"
            aria-label={`Task Progress: ${progressPercent}%`}
            className="progress-bar-container"
          >
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        )}

        <span style={{ color: '#cbd5e1' }}>{message || '就绪'}</span>

        {runId && (
          <span
            id="RunIdLabel"
            data-testid="RunIdLabel"
            data-automation-id="RunIdLabel"
            aria-label={`Run ID: ${runId}`}
            style={{ color: '#64748b', fontSize: '10px' }}
          >
            Job: {runId}
          </span>
        )}
      </div>

      <div className="status-right">
        {toast && (
          <span
            id="NotificationToast"
            data-testid="NotificationToast"
            data-automation-id="NotificationToast"
            aria-label="Notification Message"
            className="toast-message"
          >
            {toast}
          </span>
        )}

        <span
          id="ProjectPathLabel"
          data-testid="ProjectPathLabel"
          data-automation-id="ProjectPathLabel"
          aria-label="Project Path"
          style={{ color: '#94a3b8' }}
        >
          {projectPath ? `项目: ${projectPath}` : '未保存项目'}
        </span>
      </div>
    </footer>
  );
};
