# Vertical Slice 演示输入：Markdown → PPTX
# AI Presentation Engine

## 什么是 PresentationOS

- 从 Markdown / PDF / DOCX 生成可编辑 PPTX
- 统一 IR：DocumentIR → NarrativeIR → PresentationIR
- Capability ABI + Worker 协议 + Durable Workflow

## 核心架构

| 模块 | 状态 |
| --- | --- |
| Schema / IR | PASS |
| Capability Registry | PASS |
| Worker Protocol | PASS |
| PPTX Engine | PASS |
| Durable Workflow | PASS |

## 设计原则

> 先做基础 Contract，再做 Vertical Slice，最后做 Skill / GUI。
> NO EVIDENCE = NO PASS。

- 可编辑优于贴图
- 机械 QA 与审美 QA 分离
- Native PowerPoint 验证为最终关卡

## 总结

PresentationOS 的目标：一条命令把想法变成可编辑、可验证、可配音的 PPT。
