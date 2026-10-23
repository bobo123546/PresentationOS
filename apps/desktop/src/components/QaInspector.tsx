import React from 'react';
import { QaReport } from '../types.js';

interface QaInspectorProps {
  report: QaReport | null;
}

export const QaInspector: React.FC<QaInspectorProps> = ({ report }) => {
  if (!report) {
    return (
      <div className="panel panel-right">
        <div className="panel-header">
          <span className="panel-title">质量与事实核验 (QA)</span>
        </div>
        <div className="panel-content">
          <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', marginTop: '30px' }}>
            尚未执行生成。生成后检查最终 PPTX 内容；原生验证单独记录。
          </div>
        </div>
      </div>
    );
  }

  const isPassed = report.passed;
  const factPreserved = report.sourceContentPreserved;

  return (
    <div className="panel panel-right">
      <div className="panel-header">
        <span className="panel-title">质量与事实核验 (QA)</span>
      </div>

      <div className="panel-content">
        {/* Overall Score Badge */}
        <div
          id="QaScoreBadge"
          data-testid="QaScoreBadge"
          data-automation-id="QaScoreBadge"
          aria-label={`QA Overall Score: ${report.overallScore}`}
          className={`qa-score-badge ${isPassed ? '' : 'failed'}`}
        >
          {report.overallScore} / 100 {isPassed ? '✓ 达标' : '✗ 待整改'}
        </div>

        {/* Fact Validation Indicator */}
        <div
          id="FactValidationBadge"
          data-testid="FactValidationBadge"
          data-automation-id="FactValidationBadge"
          aria-label="Output Content Readback"
          className={`fact-badge ${factPreserved ? '' : 'violated'}`}
        >
          <span>{factPreserved ? '输出内容回读通过' : '输出内容回读未通过'}</span>
        </div>

        {/* Mechanical QA Breakdown */}
        <div className="qa-card">
          <div className="form-label">机械质检规则 (Mechanical QA)</div>
          <div
            id="MechanicalQaList"
            data-testid="MechanicalQaList"
            data-automation-id="MechanicalQaList"
            aria-label="Mechanical QA Rules"
            className="qa-list"
          >
            <div className="qa-list-item">
              <span>结构与对象边界</span>
              <span>{report.mechanicalPassed ? 'PASS' : '未通过'}</span>
            </div>
            <div className="qa-list-item">
              <span>PowerPoint 原生验证</span>
              <span>{report.nativeStatus ?? 'NOT_ATTEMPTED'}</span>
            </div>
            <div className="qa-list-item">
              <span>字体替换与视觉保真</span>
              <span>尚需原生验收</span>
            </div>
          </div>
        </div>

        {/* Visual QA Breakdown */}
        <div className="qa-card">
          <div className="form-label">视觉质量评分 (Visual QA)</div>
          <div
            id="VisualQaList"
            data-testid="VisualQaList"
            data-automation-id="VisualQaList"
            aria-label="Visual QA Breakdown"
            className="qa-list"
          >
            <div className="qa-list-item">
              <span>确定性排版规则</span>
              <span>{report.visualPassed ? 'PASS' : '未通过'}</span>
            </div>
            <div className="qa-list-item">
              <span>评分范围</span>
              <span>规则检查，非审美认证</span>
            </div>
            <div className="qa-list-item">
              <span>幻灯片总数</span>
              <span>{report.slidesCount} 页</span>
            </div>
          </div>
        </div>

        {/* Detected Issues */}
        <div className="qa-card">
          <div className="form-label">建议与待修复项 ({report.issuesCount})</div>
          <div
            id="QaIssuesList"
            data-testid="QaIssuesList"
            data-automation-id="QaIssuesList"
            aria-label="QA Issues List"
            className="qa-list"
          >
            {report.issues && report.issues.length > 0 ? (
              report.issues.map((issue, idx) => (
                <div key={idx} className="qa-list-item" style={{ color: '#f59e0b' }}>
                  <span>P{issue.slideIndex + 1}: {issue.message}</span>
                </div>
              ))
            ) : (
              <div style={{ color: '#10b981', fontSize: '11px' }}>
                本轮规则未返回问题；实际渲染与文字截断仍需原生验收。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
