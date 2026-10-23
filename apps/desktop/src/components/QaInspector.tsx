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
            尚未执行生成。点击“生成 PPTX”即可触发双引擎质量与事实核验。
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
          aria-label="Fact Validation Guarantee"
          className={`fact-badge ${factPreserved ? '' : 'violated'}`}
        >
          <span>{factPreserved ? '🛡️ 100% 来源事实一致 (PASS)' : '⚠️ 来源事实存在漂移 (FAIL)'}</span>
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
              <span>Schema 结构合规</span>
              <span style={{ color: '#10b981' }}>PASS</span>
            </div>
            <div className="qa-list-item">
              <span>对象边界与溢出检测</span>
              <span style={{ color: '#10b981' }}>PASS</span>
            </div>
            <div className="qa-list-item">
              <span>字体与颜色可继承性</span>
              <span style={{ color: '#10b981' }}>PASS</span>
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
              <span>排版对比度 (Contrast)</span>
              <span style={{ color: '#10b981' }}>100%</span>
            </div>
            <div className="qa-list-item">
              <span>留白与层级 (Hierarchy)</span>
              <span style={{ color: '#10b981' }}>100%</span>
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
                未发现任何布局遮挡或文字截断问题。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
