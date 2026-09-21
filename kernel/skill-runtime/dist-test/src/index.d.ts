export interface SkillInput {
    name: string;
    type: string;
    required: boolean;
    description?: string;
}
export interface SkillDef {
    name: string;
    version: string;
    description: string;
    capability: string;
    inputs: SkillInput[];
    /** skill.yaml 所在目录（含 SKILL.md 与脚本） */
    dir: string;
}
export interface SkillRunInput {
    markdown?: string;
    markdownPath?: string;
    output?: string;
    reference?: string;
    title?: string;
}
export interface SkillRunResult {
    ok: boolean;
    skill: string;
    capability: string;
    output?: string;
    artifacts: string[];
    error?: string;
}
/** 解析并校验 skill.yaml 文本 */
export declare function parseSkill(yamlText: string, dir: string): SkillDef;
/** 从目录加载 skill.yaml */
export declare function loadSkill(dir: string): SkillDef;
/** 校验输入（required / type） */
export declare function validateInputs(skill: SkillDef, input: SkillRunInput): string[];
/** 执行 Skill：当前支持 capability deck.render（内建：md→pptx，可带 reference 模板） */
export declare function runSkill(skill: SkillDef, input: SkillRunInput): Promise<SkillRunResult>;
