import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from './api.js';
import { parseMarkdownToSlides, outlineToMarkdown } from './outline.js';
import { HeaderBar } from './components/HeaderBar.js';
import { MarkdownEditor } from './components/MarkdownEditor.js';
import { SlidePreview } from './components/SlidePreview.js';
import { QaInspector } from './components/QaInspector.js';
import { StatusBar } from './components/StatusBar.js';
import { SlideItem, CompilationState, QaReport, CompileProfile } from './types.js';
import { encodeImportFile, importedAsset, restoreCompileProfile, sha256Text } from './import-assets.js';
import type { AssetKind, LocalImportFile } from './import-assets.js';

const DEFAULT_MARKDOWN = `# PresentationOS 现代演示系统

## 架构设计
- 严格类型契约与持久化工作流
- 生成后逐项读回文字、表格和图表
- PowerPoint 原生验收单独记录

## 核心特性
- 检出内容缺失时拒绝发布
- 多种版式与领域配色
- Windows 桌面宿主与本地服务`;

export const App: React.FC = () => {
  const [dataRoot, setDataRoot] = useState('');
  const compilationEpoch = useRef(0);
  const activeCancellation = useRef<{ epoch: number; runId: string | null; requested: boolean; sending: Promise<void> | null } | null>(null);
  const [projectIdentity, setProjectIdentity] = useState(() => ({ projectId: 'project-' + globalThis.crypto.randomUUID(), createdAt: new Date().toISOString() }));
  const [title, setTitle] = useState<string>('PresentationOS 演示文稿');
  const [markdown, setMarkdown] = useState<string>(DEFAULT_MARKDOWN);
  const [slides, setSlides] = useState<SlideItem[]>(() => parseMarkdownToSlides(DEFAULT_MARKDOWN));
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [compileProfile, setCompileProfile] = useState<CompileProfile>({});
  const [busyOperation, setBusyOperation] = useState<string | null>(null);
  // A ref closes the gap before React commits the disabled controls.
  const operationLock = useRef<string | null>(null);

  const [compilation, setCompilation] = useState<CompilationState>({
    status: 'IDLE',
    runId: null,
    progressPercent: 0,
    message: '就绪',
    pptxPath: null,
    reportPath: null,
    qaReport: null,
    durationMs: null,
    error: null,
  });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);
  useEffect(() => {
    let active = true;
    apiFetch('/api/session').then(async res => {
      const session = await res.json();
      if (!res.ok) throw new Error(session.error ?? '请使用桌面应用的会话链接');
      if (active) setDataRoot(session.dataRoot.replace(/\\/g, '/'));
    }).catch(err => active && showToast(err.message));
    return () => { active = false; compilationEpoch.current++; };
  }, [showToast]);

  const handleImportMarkdown = () => {
    if (operationLock.current) return;
    invalidateOutput();
    const parsed = parseMarkdownToSlides(markdown, slides);
    setSlides(parsed);
    setSelectedIndex(0);
    showToast(`已解析 ${parsed.length} 个章节；导出时自动分页`);
  };

  const clearSourceBinding = () => {
    if (compileProfile.sourceAsset) {
      setCompileProfile(previous => ({ referenceAsset: previous.referenceAsset }));
      showToast('源文已编辑；后续将按当前 Markdown 生成，不再使用原始导入文件。');
    }
  };

  const handleImportAsset = async (file: LocalImportFile, kind: AssetKind) => {
    if (operationLock.current || !dataRoot) return;
    const operation = `import-${kind}`;
    operationLock.current = operation;
    setBusyOperation(operation);
    const epoch = compilationEpoch.current;
    try {
      const base64 = await encodeImportFile(file, kind);
      const response = await apiFetch('/api/assets/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, base64, kind }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? '文件导入失败');
      const asset = importedAsset(result.asset);
      if (kind === 'document') {
        if (typeof result.markdown !== 'string') throw new Error('导入结果缺少可编辑源文');
        const markdownSha256 = await sha256Text(result.markdown);
        if (epoch !== compilationEpoch.current) return;
        invalidateOutput();
        setMarkdown(result.markdown);
        setSlides(parseMarkdownToSlides(result.markdown));
        setSelectedIndex(0);
        setCompileProfile(previous => ({ ...previous, sourceAsset: { ...asset, markdownSha256 } }));
        showToast(`已导入 ${asset.filename}；按原始文件的正文与表格生成，编辑正文后切换为 Markdown。`);
      } else {
        if (result.scope !== 'theme-colors-and-fonts') throw new Error('参考文稿返回了不支持的应用范围');
        if (epoch !== compilationEpoch.current) return;
        invalidateOutput();
        setCompileProfile(previous => ({ ...previous, referenceAsset: asset }));
        showToast(`已选用 ${asset.filename} 的主题配色与字体，下次生成生效。`);
      }
    } catch (err: any) {
      if (epoch === compilationEpoch.current) showToast(`导入失败: ${err.message}`);
    } finally {
      if (operationLock.current === operation) { operationLock.current = null; setBusyOperation(null); }
    }
  };

  const handleClearReference = () => {
    if (operationLock.current) return;
    invalidateOutput();
    setCompileProfile(previous => ({ sourceAsset: previous.sourceAsset }));
  };

  const invalidateOutput = () => {
    compilationEpoch.current++;
    setCompilation({ status: 'IDLE', runId: null, progressPercent: 0, message: '内容已变更，请重新生成',
      pptxPath: null, reportPath: null, qaReport: null, durationMs: null, error: null });
  };

  const handleUpdateSlide = (updated: Partial<SlideItem>) => {
    if (operationLock.current) return;
    invalidateOutput();
    const next = slides.map((slide, index) => index === selectedIndex ? { ...slide, ...updated } : slide);
    setSlides(next);
    if (updated.title !== undefined || updated.bullets !== undefined) { clearSourceBinding(); setMarkdown(outlineToMarkdown(next)); }
  };

  const handleNewProject = () => {
    if (operationLock.current) return;
    compilationEpoch.current++;
    setProjectIdentity({ projectId: 'project-' + globalThis.crypto.randomUUID(), createdAt: new Date().toISOString() });
    setTitle('新演示文稿');
    setMarkdown('# 新演示文稿\n\n## 页面 1\n- 示例内容');
    const parsed = parseMarkdownToSlides('# 新演示文稿\n\n## 页面 1\n- 示例内容');
    setSlides(parsed);
    setSelectedIndex(0);
    setProjectPath(null);
    setCompileProfile({});
    setCompilation({
      status: 'IDLE',
      runId: null,
      progressPercent: 0,
      message: '新建项目已就绪',
      pptxPath: null,
      reportPath: null,
      qaReport: null,
      durationMs: null,
      error: null,
    });
    showToast('已新建空白项目');
  };

  const handleOpenProject = async () => {
    if (operationLock.current || !dataRoot) return;
    const inputPath = window.prompt('请输入项目 pres-project.json 路径:', projectPath ?? `${dataRoot}/projects/demo/pres-project.json`);
    if (!inputPath) return;
    operationLock.current = 'open'; setBusyOperation('open');
    const epoch = compilationEpoch.current;
    try {
      const res = await apiFetch(`/api/project/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectJsonPath: inputPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '打开项目失败');

      const proj = data.project;
      const restoredProfile = await restoreCompileProfile(proj.compileProfile, proj.sourceDocument?.content ?? '');
      if (epoch !== compilationEpoch.current) return;
      invalidateOutput();
      setProjectIdentity({ projectId: proj.projectId, createdAt: proj.createdAt });
      setTitle(proj.title);
      setMarkdown(proj.sourceDocument?.content || '');
      const parsed = parseMarkdownToSlides(proj.sourceDocument?.content || '');
      parsed.forEach((section, index) => Object.assign(section, proj.editorState?.sections?.[index] ?? {}));
      setSlides(parsed);
      setSelectedIndex(0);
      setProjectPath(inputPath);
      setCompileProfile(restoredProfile);
      showToast(`成功打开项目: ${proj.title}`);
    } catch (err: any) {
      if (epoch === compilationEpoch.current) showToast(`打开失败: ${err.message}`);
    } finally {
      if (operationLock.current === 'open') { operationLock.current = null; setBusyOperation(null); }
    }
  };

  const handleSaveProject = async () => {
    if (operationLock.current || !dataRoot) return;
    operationLock.current = 'save'; setBusyOperation('save');
    const epoch = compilationEpoch.current;
    const targetPath = projectPath || `${dataRoot}/projects/${encodeURIComponent(title.trim().replace(/\s+/g, '_'))}_${projectIdentity.projectId}/pres-project.json`;
    const projData = {
      schema: 'presentationos-project',
      version: '1.1.0',
      projectId: projectIdentity.projectId,
      title,
      createdAt: projectIdentity.createdAt,
      updatedAt: new Date().toISOString(),
      sourceDocument: {
        filename: 'content.md',
        format: 'markdown',
        content: markdown,
      },
      compileProfile,
      editorState: { sections: slides.map(slide => ({ speakerNotes: slide.speakerNotes ?? '', layout: slide.layout })) },
      artifacts: {
        pptxPath: compilation.pptxPath,
        qaReportPath: compilation.reportPath,
        pdfPath: null,
      },
      lastCompileState: {
        status: compilation.status,
        compiledAt: compilation.status === 'COMPLETED' ? new Date().toISOString() : null,
        durationMs: compilation.durationMs,
        error: compilation.error,
      },
    };

    try {
      const res = await apiFetch(`/api/project/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projData, projectJsonPath: targetPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存项目失败');
      if (epoch !== compilationEpoch.current) return;
      setProjectPath(targetPath);
      showToast('项目已成功保存');
    } catch (err: any) {
      if (epoch === compilationEpoch.current) showToast(`保存失败: ${err.message}`);
    } finally {
      if (operationLock.current === 'save') { operationLock.current = null; setBusyOperation(null); }
    }
  };

  const sendCancellation = async (request: NonNullable<typeof activeCancellation.current>) => {
    if (!request.runId || request.sending) return request.sending;
    request.sending = (async () => {
      try {
        const response = await apiFetch(`/api/task/cancel`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: request.runId }),
        });
        if (!response.ok) throw new Error((await response.json()).error ?? '取消失败');
        if (request.epoch !== compilationEpoch.current) return;
        setCompilation(prev => ({ ...prev, message: '已发出取消请求' }));
        showToast('已请求取消任务');
      } catch (err: any) {
        request.requested = false;
        if (request.epoch === compilationEpoch.current) showToast(`取消请求失败: ${err.message}`);
      }
    })();
    await request.sending;
    request.sending = null;
  };

  const handleCompileDeck = async () => {
    if (operationLock.current || !dataRoot) return;
    operationLock.current = 'compile';
    const epoch = ++compilationEpoch.current;
    const cancellation = { epoch, runId: null as string | null, requested: false, sending: null as Promise<void> | null };
    activeCancellation.current = cancellation;
    const outPptx = `${dataRoot}/builds/${Date.now()}/presentation.pptx`;
    const outReport = outPptx.replace(/\.pptx$/i, '.loop.json');

    setCompilation({
      status: 'RUNNING',
      runId: null,
      progressPercent: 20,
      message: '正在编译并检查实际输出内容...',
      pptxPath: null,
      reportPath: null,
      qaReport: null,
      durationMs: null,
      error: null,
    });

    try {
      const res = await apiFetch(`/api/project/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectIdentity.projectId,
          title,
          markdown: compileProfile.sourceAsset ? '' : markdown,
          sourceDocumentPath: compileProfile.sourceAsset?.path,
          sourceAssetSha256: compileProfile.sourceAsset?.sha256,
          referencePptxPath: compileProfile.referenceAsset?.path,
          referenceAssetSha256: compileProfile.referenceAsset?.sha256,
          outPptxPath: outPptx,
          outReportPath: outReport,
          async: true,
        }),
      });

      let data = await res.json();
      if (!res.ok) throw new Error(data.error || '无法启动生成任务');
      if (epoch !== compilationEpoch.current) return;
      cancellation.runId = data.sidecarRunId;
      setCompilation(prev => ({ ...prev, runId: data.sidecarRunId, progressPercent: 30 }));
      if (cancellation.requested && data.status === 'RUNNING') await sendCancellation(cancellation);
      while (data.status === 'RUNNING') {
        await new Promise(done => setTimeout(done, 200));
        if (epoch !== compilationEpoch.current) return;
        const poll = await apiFetch(`/api/task/status/${encodeURIComponent(data.sidecarRunId)}`);
        const state = await poll.json();
        if (!poll.ok || !state.tracked) throw new Error(state.error ?? '任务状态不可用');
        if (state.tracked.status !== 'RUNNING') data = { ...state.tracked.result, status: state.tracked.status };
      }
      if (epoch !== compilationEpoch.current) return;
      if (data.status === 'FAILED') {
        throw new Error(data.error || '生成失败');
      }

      if (data.status === 'CANCELLED') {
        setCompilation((prev) => ({
          ...prev,
          status: 'CANCELLED',
          message: '任务已被用户取消',
        }));
        showToast('生成任务已取消');
        return;
      }
      if (data.ok !== true || data.summary?.contentVerification?.ok !== true) throw new Error('缺少实际输出内容检查结果');

      const qa: QaReport = {
        passed: data.summary?.passed === true,
        overallScore: data.overallScore ?? 0,
        slidesCount: data.slidesCount ?? slides.length,
        issuesCount: data.issuesCount ?? 0,
        sourceContentPreserved: data.sourceContentPreserved === true && data.summary?.contentVerification?.ok === true,
        mechanicalPassed: data.summary?.mechanical?.pass === true,
        visualPassed: data.summary?.passed === true,
        nativeStatus: data.summary?.native?.status ?? 'NOT_ATTEMPTED',
        sourceTrace: data.summary?.sourceLedger && data.summary?.compiledPageMap ? {
          passed: data.summary.compiledPageMap.readback?.status === 'PASS'
            && data.summary.compiledPageMap.integrity?.sourceReferences === 'PASS'
            && data.summary.compiledPageMap.integrity?.protectedOccurrences === 'PASS'
            && data.summary.compiledPageMap.integrity?.quotationCoverage === 'PASS'
            && data.summary.compiledPageMap.integrity?.tableContext === 'PASS',
          chunks: data.summary.sourceLedger.chunks.length,
          occurrences: data.summary.sourceLedger.facts.length,
          pages: data.summary.compiledPageMap.pages.length,
        } : undefined,
        issues: (data.summary?.visual?.issues ?? []).map((issue: any) => ({ slideIndex: issue.slide - 1, message: issue.message, ruleId: issue.rule, severity: issue.severity })),
      };

      setCompilation({
        status: 'COMPLETED',
        runId: data.runId,
        progressPercent: 100,
        message: `生成完成！耗时 ${data.durationMs}ms`,
        pptxPath: data.pptxPath,
        reportPath: data.reportPath,
        qaReport: qa,
        durationMs: data.durationMs,
        error: null,
      });

      showToast('PPTX 已生成并通过内容回读；原生验证状态请查看报告。');
    } catch (err: any) {
      if (epoch !== compilationEpoch.current) return;
      setCompilation((prev) => ({
        ...prev,
        status: 'FAILED',
        message: `生成失败: ${err.message}`,
        error: err.message,
      }));
      showToast(`生成出错: ${err.message}`);
    } finally {
      if (activeCancellation.current === cancellation) activeCancellation.current = null;
      if (operationLock.current === 'compile') operationLock.current = null;
    }
  };

  const handleCancelTask = async () => {
    const request = activeCancellation.current;
    if (!request || request.epoch !== compilationEpoch.current || request.requested) return;
    request.requested = true;
    if (!request.runId) {
      setCompilation(prev => ({ ...prev, message: '已记录取消请求，等待任务启动响应...' }));
      showToast('任务启动后将立即请求取消');
      return;
    }
    await sendCancellation(request);
  };

  const handleExportPptx = async () => {
    if (operationLock.current) return;
    if (!compilation.pptxPath) {
      showToast('尚未生成 PPTX 文件，无法导出');
      return;
    }

    const defaultExportPath = `${dataRoot}/exports/${title.trim().replace(/\s+/g, '_')}.pptx`;
    const targetPath = window.prompt('请输入导出目标路径:', defaultExportPath);
    if (!targetPath) return;

    try {
      const res = await apiFetch(`/api/project/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePptxPath: compilation.pptxPath,
          targetPptxPath: targetPath,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '导出失败');

      showToast(`文稿已成功导出至: ${targetPath}`);
    } catch (err: any) {
      showToast(`导出失败: ${err.message}`);
    }
  };

  const handleReconstruct = async () => {
    if (operationLock.current) return;
    try {
      showToast('正在转换输入的场景对象...');
      const rawScene = window.prompt('粘贴已解析的 SceneIR JSON。此入口只转换已有场景，不会执行截图识别。');
      if (!rawScene) return;
      const sampleScene = JSON.parse(rawScene);
      if (!Array.isArray(sampleScene.elements) || !sampleScene.elements.length) throw new Error('场景必须包含真实元素');

      const res = await apiFetch(`/api/reconstruct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneIr: sampleScene }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '重建失败');
      showToast(`场景转换完成，输入对象可编辑比例: ${(data.result.editableCoverageRatio * 100).toFixed(0)}%`);
    } catch (err: any) {
      showToast(`重建失败: ${err.message}`);
    }
  };

  const handleMediaExport = async () => {
    if (operationLock.current) return;
    try {
      if (!compilation.pptxPath || compilation.status !== 'COMPLETED') throw new Error('请先生成当前文稿，再导出视频');
      if (compilation.qaReport?.slidesCount !== slides.length) {
        throw new Error(`文稿自动分页为 ${compilation.qaReport?.slidesCount ?? '未知'} 页，当前有 ${slides.length} 个章节。请按最终页面拆分章节并重新生成，确保图片和配音逐页对应。`);
      }
      showToast('正在合成旁白、逐页时间轴与字幕视频...');
      const targetMp4 = projectPath ? projectPath.replace(/pres-project\.json$/, 'presentation.mp4') : `${dataRoot}/media/${Date.now()}/presentation.mp4`;
      const paths = window.prompt(`按页面顺序填写 ${slides.length} 个真实 PNG 路径（每行一个，须在数据目录内）：`);
      if (!paths) return;
      const imagePaths = paths.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (imagePaths.length !== slides.length) throw new Error('图片数量与页数不一致');
      const slidePayload = slides.map((s, idx) => ({
        id: s.id,
        index: idx,
        imagePath: imagePaths[idx],
        notes: s.speakerNotes || s.bullets.join('；'),
      }));

      const res = await apiFetch(`/api/media/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides: slidePayload, outMp4Path: targetMp4 }),
      });
      const data = await res.json();
      if (!res.ok || data.result?.ok !== true) throw new Error(data.error || data.result?.qa?.errors?.join('; ') || '合成音视频未通过检查');
      showToast(`音视频与字幕导出成功！总时长: ${data.result.totalDurationSec}s`);
    } catch (err: any) {
      showToast(`音视频导出失败: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <HeaderBar
        title={title}
        onTitleChange={value => { if (operationLock.current) return; invalidateOutput(); setTitle(value); }}
        ready={Boolean(dataRoot)}
        status={compilation.status}
        hasPptx={Boolean(compilation.pptxPath)}
        busy={Boolean(busyOperation)}
        onNew={handleNewProject}
        onOpen={handleOpenProject}
        onSave={handleSaveProject}
        onCompile={handleCompileDeck}
        onCancel={handleCancelTask}
        onExport={handleExportPptx}
        onReconstruct={handleReconstruct}
        onMediaExport={handleMediaExport}
      />

      <main className="studio-container">
        <MarkdownEditor
          markdown={markdown}
          onMarkdownChange={value => { if (operationLock.current) return; invalidateOutput(); clearSourceBinding(); setMarkdown(value); setSlides(parseMarkdownToSlides(value, slides)); setSelectedIndex(0); }}
          onImport={handleImportMarkdown}
          onImportDocument={file => handleImportAsset(file, 'document')}
          onImportReference={file => handleImportAsset(file, 'reference-template')}
          onClearReference={handleClearReference}
          sourceFilename={compileProfile.sourceAsset?.filename}
          referenceFilename={compileProfile.referenceAsset?.filename}
          busyOperation={busyOperation}
          slides={slides}
          selectedIndex={selectedIndex}
          onSelectSlide={setSelectedIndex}
          disabled={compilation.status === 'RUNNING' || Boolean(busyOperation) || !dataRoot}
        />

        <SlidePreview
          slide={slides[selectedIndex] || null}
          onUpdateSlide={handleUpdateSlide}
          disabled={compilation.status === 'RUNNING' || Boolean(busyOperation) || !dataRoot}
        />

        <QaInspector report={compilation.qaReport} />
      </main>

      <StatusBar
        compilation={compilation}
        projectPath={projectPath}
        toast={toast}
      />
    </div>
  );
};
