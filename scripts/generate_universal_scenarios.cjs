const fs = require('fs');
const path = require('path');
const { renderDeck } = require('D:/PresentationOS/kernel/pptx-engine/dist/renderer.js');
const { resolveSlideRects } = require('D:/PresentationOS/kernel/pptx-engine/dist/layout-solver.js');

async function main() {
  console.log('=== Generating High-Stakes Universal Presentations for All Scenarios ===');
  const outDir = 'D:/PresentationOSData';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 1. Finance: IPO Roadshow & DCF Valuation
  console.log('\n[1/4] Generating Finance: IPO Roadshow & DCF Valuation Deck...');
  const financeDeck = {
    schema: 'deck-spec',
    version: '1',
    title: 'CloudMatrix Inc. 纳斯达克 IPO 股票全球路演推介与 DCF 估值分析',
    subtitle: '摩根士丹利 & 高盛联合全球协调人 · 机构投资者路演 Presentation',
    author: '全球投资银行部 · 科技与传媒通信组 (TMT)',
    domain: 'finance',
    slides: [
      {
        id: 's1',
        title: 'CloudMatrix Inc. 纳斯达克 IPO 股票全球路演推介',
        blocks: [
          { type: 'heading', text: 'CloudMatrix Inc. 全球 IPO 股票发售路演' },
          { type: 'paragraph', text: '股票代码: CMX · 发行规模: 1,500 万股 ADS · 预期定价区间: $24.00 - $28.00' }
        ]
      },
      {
        id: 's2',
        title: '资本结构与全球红筹上市拓扑架构',
        blocks: [
          {
            type: 'pyramid',
            data: {
              apex: { title: '公众投资者 (Public Float)', desc: '纳斯达克上市流通 ADS 占总股本 18.5%' },
              pillars: [
                { title: '创始人与核心管理层', desc: '持有 Class B 超级表决权股 (10:1)' },
                { title: '顶级战略基石投资人', desc: '红杉资本、高瓴资本长期锁定 180 天' }
              ],
              foundation: { title: '境内全资实体与核心知识产权', desc: '开曼母公司 100% 控股 WFOE 及运营实体' }
            }
          }
        ]
      },
      {
        id: 's3',
        title: '核心财务指标与盈利模型爆发',
        blocks: [
          {
            type: 'cardGrid',
            cards: [
              { label: '2025E 营业收入', value: '12.8 亿美元', detail: '年复合增长率 (CAGR) 达到 48.6%' },
              { label: '经调整 EBITDA', value: '3.42 亿美元', detail: 'EBITDA 利润率突破 26.7%' },
              { label: '毛利率 (Gross Margin)', value: '68.4%', detail: '高毛利纯软件订阅 SaaS 收入占比 89%' },
              { label: '净留存率 (NDR)', value: '138.5%', detail: '大客户续费与扩容能力强劲' }
            ]
          }
        ]
      },
      {
        id: 's4',
        title: '可比上市公司横向估值对比 (P/E & EV/EBITDA)',
        blocks: [
          {
            type: 'comparison',
            data: {
              left: {
                title: '传统软件巨头标杆',
                items: ['收入增速放缓 (CAGR 8%~12%)', 'EV/Sales 估值倍数 4.5x - 6.0x', '受限于存量私有化架构交付周期长', '研发开支占比 14.5%']
              },
              right: {
                title: 'CloudMatrix 竞争优势',
                items: ['新一代云原生 AI 架构，CAGR 48.6%', 'EV/Sales 溢价区间 12.0x - 14.5x', '即开即用分钟级部署，ARR 增速行业领跑', '研发开支占比 28.2%，拥有 42 项核心专利']
              }
            }
          }
        ]
      },
      {
        id: 's5',
        title: '未来五年现金流折现 (DCF) 预测基准模型',
        blocks: [
          {
            type: 'table',
            tableData: [
              ['年度指标 (百万美元)', '2024A', '2025E', '2026E', '2027E', '2028E'],
              ['营业收入 (Revenue)', '862.0', '1,280.0', '1,850.0', '2,590.0', '3,480.0'],
              ['毛利润 (Gross Profit)', '586.2', '875.5', '1,276.5', '1,813.0', '2,470.8'],
              ['自由现金流 (FCF)', '145.0', '268.0', '432.0', '685.0', '980.0'],
              ['加权平均资本成本 (WACC)', '9.2%', '9.2%', '9.0%', '8.8%', '8.8%']
            ]
          }
        ]
      },
      {
        id: 's6',
        title: '全球发售与挂牌上市实施时间轴',
        blocks: [
          {
            type: 'timeline',
            events: [
              { title: 'SEC 秘密递表', date: 'STAGE 01', desc: '完成 Form F-1 申报与财务审计清算' },
              { title: '公开交表与公开展开', date: 'STAGE 02', desc: '向市场公开招股书并启动投行分析师预路演' },
              { title: '全球投资者路演', date: 'STAGE 03', desc: '纽约、波士顿、伦敦、新加坡一对一机构路演' },
              { title: '最终定价与挂牌上市', date: 'STAGE 04', desc: '簿记建档超额认购，确定发行价并开盘交易' }
            ]
          }
        ]
      }
    ]
  };
  await renderDeck(financeDeck, {
    outPath: path.join(outDir, 'finance_presentation_ipo.pptx'),
    resolveRects: resolveSlideRects,
    forceOverwrite: true
  });
  console.log('  -> Saved finance_presentation_ipo.pptx');

  // 2. Consulting: McKinsey-Style Digital Transformation
  console.log('\n[2/4] Generating Consulting: McKinsey-Style Digital Transformation Deck...');
  const consultingDeck = {
    schema: 'deck-spec',
    version: '1',
    title: '大型跨国集团数字化转型顶层设计与战略落地蓝图',
    subtitle: '麦肯锡战略咨询项目组 · 呈报董事会与执行委员会',
    author: '全球数字化与组织变革实践合伙人',
    domain: 'consulting',
    slides: [
      {
        id: 'c1',
        title: '大型跨国集团数字化转型顶层设计与战略落地蓝图',
        blocks: [
          { type: 'heading', text: '大型跨国集团数字化转型战略规划' },
          { type: 'paragraph', text: '从业务驱动到数据驱动：三年数字化破局路径与组织重构' }
        ]
      },
      {
        id: 'c2',
        title: '数字化转型四层全景架构蓝图',
        blocks: [
          {
            type: 'architecture',
            data: {
              layers: [
                { name: 'L1 全场景业务触点', desc: '全渠道移动客户端、智慧门店、大客户企业门户、智能供应链看板' },
                { name: 'L2 业务赋能中台', desc: '统一客户主数据 (CDP)、全渠道订单协同、柔性生产调度引擎' },
                { name: 'L3 数据与智能底座', desc: '实时数据湖仓、大语言模型知识中枢、端到端自动化编排引擎' },
                { name: 'L4 混合基础设施', desc: '多云合规容灾部署、敏捷 DevOps 流水线、零信任安全边界' }
              ]
            }
          }
        ]
      },
      {
        id: 'c3',
        title: '转型举措战略优先级矩阵 (Business Impact vs Feasibility)',
        blocks: [
          {
            type: 'quadrant',
            data: {
              q1: { title: '战略必争 (High Impact, High Feasibility)', items: ['智慧供应链即时补货', '客户统一画像系统', '智能客服中心'] },
              q2: { title: '快速见效 (Moderate Impact, High Feasibility)', items: ['移动审批全流程在线', '财务自动化月结 RPA', '电子合同签署'] },
              q3: { title: '基础设施 (High Impact, Complex)', items: ['核心 ERP 全面云化升级', '全球统一数据底座建设', '自研算法中台'] },
              q4: { title: '审慎评估 (Low Impact, Low Feasibility)', items: ['元宇宙虚拟展厅', '边缘小众协议定制', '盲目重构旧系统'] }
            }
          }
        ]
      },
      {
        id: 'c4',
        title: '组织变革管理与敏捷推广四阶段闭环',
        blocks: [
          {
            type: 'process',
            steps: [
              { step: '01', title: '现状诊断与基线评估', desc: '访谈 120 位业务骨干，梳理 48 项痛点并确立数字化基线' },
              { step: '02', title: '灯塔试点敏捷攻坚', desc: '选定 2 个标杆事业部，用 90 天打造首批最小可行成果 (MVP)' },
              { step: '03', title: '组织赋能与能力转移', desc: '建立企业数字化卓越中心 (CoE)，培训 500 位业务数智人才' },
              { step: '04', title: '全面推广与持续迭代', desc: '全集团 8 个业务板块无缝铺开，形成按季度考核的 KPI 闭环' }
            ]
          }
        ]
      },
      {
        id: 'c5',
        title: '数字化转型预期商业价值量化测算',
        blocks: [
          {
            type: 'cardGrid',
            cards: [
              { label: '年度运营成本降低', value: '1.45 亿元', detail: '供应链周转天数由 45 天降至 26 天' },
              { label: '新产品研发周期缩短', value: '42.0%', detail: '从立项到量产从 9 个月压缩至 5.2 个月' },
              { label: '客户净推荐值 (NPS)', value: '+38 点', detail: '交付延误率从 8.4% 降低至 0.6%' },
              { label: '全员人均创效提升', value: '31.5%', detail: '高价值业务处理效率成倍增长' }
            ]
          }
        ]
      },
      {
        id: 'c6',
        title: '数字化转型核心战略洞见与原则',
        blocks: [
          {
            type: 'quote',
            quoteText: '数字化转型的本质不是技术更迭，而是企业组织阵型与决策文化的根本重塑。凡是不以解决实际业务痛点为终局的技术投资，终将沦为企业负债。',
            author: '麦肯锡项目顾问组 · 数字化顶层战略原则'
          }
        ]
      }
    ]
  };
  await renderDeck(consultingDeck, {
    outPath: path.join(outDir, 'consulting_presentation_strategy.pptx'),
    resolveRects: resolveSlideRects,
    forceOverwrite: true
  });
  console.log('  -> Saved consulting_presentation_strategy.pptx');

  // 3. Legal: Patent Infringement Defense & Cross-Border Compliance
  console.log('\n[3/4] Generating Legal: Patent Infringement Defense & Compliance Deck...');
  const legalDeck = {
    schema: 'deck-spec',
    version: '1',
    title: '跨国芯片架构专利侵权诉讼不侵权抗辩与有效性分析',
    subtitle: '国际知名律师事务所 · 呈送联邦巡回上诉法院与特聘专家组',
    author: '资深专利诉讼主管合伙人 · 全球知识产权业务部',
    domain: 'legal',
    slides: [
      {
        id: 'l1',
        title: '跨国芯片架构专利侵权诉讼抗辩分析报告',
        blocks: [
          { type: 'heading', text: '涉案核心专利不侵权抗辩与有效性分析' },
          { type: 'paragraph', text: '案号: CA-2026-CV-8849 · 涉案专利号: US 9,842,105 B2 · 抗辩方法律意见' }
        ]
      },
      {
        id: 'l2',
        title: '诉讼争议焦点权利要求 1~4 全面覆盖原则侵权比对',
        blocks: [
          {
            type: 'comparison',
            data: {
              left: {
                title: '原告主张之专利权利要求 (US 9,842,105)',
                items: [
                  '必要技术特征 A: 包含独立的片上硬件仲裁总线',
                  '必要技术特征 B: 采用集中式静态时间片轮转调度',
                  '必要技术特征 C: 仅允许单一外部时钟源输入',
                  '必要技术特征 D: 缺失异步缓冲区状态标志位'
                ]
              },
              right: {
                title: '被告被控芯片实际技术特征 (全面不覆盖)',
                items: [
                  '抗辩事实 A: 采用完全分布式的点对点网络 (NoC) 互联',
                  '抗辩事实 B: 采用动态权重自适应信用分流调度机制',
                  '抗辩事实 C: 内置多域独立双锁相环 (PLL) 动态变频',
                  '抗辩事实 D: 具备多级异步 FIFO 溢出检测硬件中断'
                ]
              }
            }
          }
        ]
      },
      {
        id: 'l3',
        title: '涉案法律证据链网与事实印证拓扑架构',
        blocks: [
          {
            type: 'architecture',
            data: {
              layers: [
                { name: 'L1 司法鉴定结论', desc: '国家级微电子司法鉴定所官方源代码与版图比对不侵权意见书' },
                { name: 'L2 现有技术对比文件', desc: '涉案专利申请日之前公开的 3 篇 IEEE 顶会论文构成完整现有技术抗辩' },
                { name: 'L3 研发原始底稿记录', desc: '被告研发团队自主独立研发全流程 Git Commit 与芯片流片代工记录' },
                { name: 'L4 行业专家证人证言', desc: '两院院士及微体系结构国际权威专家签署的宣誓证词' }
              ]
            }
          }
        ]
      },
      {
        id: 'l4',
        title: '核心证据清单与质证意见横向对比表',
        blocks: [
          {
            type: 'table',
            tableData: [
              ['证据编号', '证据名称', '证明目的', '质证与对抗意见', '采信风险'],
              ['EX-01', '芯片流片 GDSII 版图文件', '证明总线拓扑为分布式 NoC', '中立客观证据，原告无异议', '极低'],
              ['EX-02', '2021 年 IEEE 论文 (Prior Art)', '证明涉案专利权利要求缺乏新颖性', '先于专利申请日 14 个月公开', '极低'],
              ['EX-03', '原告专家单方逆向拆解报告', '原告证明侵权之唯一技术凭证', '测试手段有瑕疵，未控制变量', '不可采信'],
              ['EX-04', '涉案芯片销售合同及发票', '原告索赔金额依据', '已剔除境外未受保护销售额', '可辩驳']
            ]
          }
        ]
      },
      {
        id: 'l5',
        title: '诉讼抗辩预期收益与索赔金额风险对冲',
        blocks: [
          {
            type: 'cardGrid',
            cards: [
              { label: '原告索赔主张标的额', value: '4,500 万美元', detail: '基于全球销售额测算的不合理高额索赔' },
              { label: '合理预期抗辩判定结果', value: '完全驳回起诉', detail: '不满足全面覆盖原则，且现有技术抗辩成立' },
              { label: '专利无效宣告成功率', value: '88.5%', detail: '已向专利局 PTAB 提起多方复审 (IPR)' },
              { label: '预计节约直接商业损失', value: '3.2 亿美元', detail: '消除下架禁令风险，保障全球市场供应链安全' }
            ]
          }
        ]
      },
      {
        id: 'l6',
        title: '主办大律师核心法律意见陈述',
        blocks: [
          {
            type: 'quote',
            quoteText: '基于涉案专利权利要求的严格文义解释与等同原则限制，被控产品在微体系结构拓扑、调度算法与时钟机制上均与专利具有实质性差异。原告指控不成立，建议坚定不移推进专利无效程序与不侵权诉讼抗辩。',
            author: '主办合伙人兼专利诉讼首席出庭律师 · 法律抗辩要旨'
          }
        ]
      }
    ]
  };
  await renderDeck(legalDeck, {
    outPath: path.join(outDir, 'legal_presentation_compliance.pptx'),
    resolveRects: resolveSlideRects,
    forceOverwrite: true
  });
  console.log('  -> Saved legal_presentation_compliance.pptx');

  // 4. Incident Postmortem: P0 DevOps Incident Postmortem & Defense in Depth
  console.log('\n[4/4] Generating Engineering: P0 Incident Postmortem & Architecture Hardening Deck...');
  const postmortemDeck = {
    schema: 'deck-spec',
    version: '1',
    title: 'P0 级核心支付交易链路雪崩故障复盘 (RCA) 与纵深防御整改',
    subtitle: '技术委员会 & 基础架构平台组 · 全体技术全员事故复盘会议',
    author: '首席架构师 & 稳定性保障委员会 (SRE)',
    domain: 'engineering',
    slides: [
      {
        id: 'p1',
        title: 'P0 核心支付交易链路雪崩事故根因复盘与防御加固',
        blocks: [
          { type: 'heading', text: 'P0 级核心故障根本原因分析 (RCA) 报告' },
          { type: 'paragraph', text: '故障等级: P0 · 影响时长: 24 分钟 · 核心交易受损率: 18.2% · 故障总结与整改' }
        ]
      },
      {
        id: 'p2',
        title: '故障发展时序分钟级还原与应急响应时序',
        blocks: [
          {
            type: 'timeline',
            events: [
              { title: '14:02 突发大促流量', date: 'T+00m', desc: '营销活动引爆，交易链路 QPS 瞬时冲高 4.8 倍超出预估阈值' },
              { title: '14:05 慢 SQL 拖垮连接池', date: 'T+03m', desc: '未建联合索引的优惠券验证查询导致主库 CPU 飙升至 100%' },
              { title: '14:08 级联雪崩与线程阻塞', date: 'T+06m', desc: '下游微服务无熔断保护，上游网关 10,000+ 线程全部卡死在 IO 等待' },
              { title: '14:15 应急隔离与流量旁路', date: 'T+13m', desc: 'SRE 执行降级止血预案，切断非核心优惠核销，交易成功率恢复 99.9%' }
            ]
          }
        ]
      },
      {
        id: 'p3',
        title: '多活容灾与五重纵深防御技术架构整改蓝图',
        blocks: [
          {
            type: 'architecture',
            data: {
              layers: [
                { name: 'L1 边缘层：全局自适应限流', desc: '基于 BBR 算法的智能丢包与验证码反爬拦截，阻断 80% 非法突增请求' },
                { name: 'L2 网关层：微服务熔断隔离', desc: 'Sentinel / Resilience4j 毫秒级熔断机制，隔离下游不可用节点' },
                { name: 'L3 应用层：单元化无状态部署', desc: '三地五中心单元化多活，单单元故障自动无缝秒级切流' },
                { name: 'L4 数据层：读写分离与缓存穿透防护', desc: '主从毫秒同步、布隆过滤器全量拦截、慢 SQL 自动超时熔断终止' }
              ]
            }
          }
        ]
      },
      {
        id: 'p4',
        title: '整改前后高可用核心指标对比',
        blocks: [
          {
            type: 'comparison',
            data: {
              left: {
                title: '故障前脆弱架构瓶颈',
                items: [
                  '单体数据库集中式连接，无租户隔离',
                  '下游超时时间设置长达 5000ms，极易线程积压',
                  '无自动降级规则，依赖人工值班登机操作',
                  '容量压测仅覆盖基线流量，缺乏极端毛刺演练'
                ]
              },
              right: {
                title: '加固后高可用弹性架构',
                items: [
                  '全链路单元化多活隔离，故障半径收敛至单一单元',
                  '严格遵循 200ms 超时与指数退避重试预算',
                  '自适应动态熔断旁路，0 人工干预 3 秒内自愈',
                  '每周常态化混沌工程演练 (Chaos Engineering) 注入故障'
                ]
              }
            }
          }
        ]
      },
      {
        id: 'p5',
        title: '架构防线加固关键衡量指标',
        blocks: [
          {
            type: 'cardGrid',
            cards: [
              { label: '故障自愈恢复时长 (RTO)', value: '< 15 秒', detail: '从过去 24 分钟降低至 15 秒秒级自愈' },
              { label: '核心交易数据丢损 (RPO)', value: '0 丢失', detail: '基于 Raft 分布式一致性协议强保障' },
              { label: '系统高可用性 SLA 目标', value: '99.995%', detail: '全年非计划停机时间控制在 26 分钟内' },
              { label: '混沌工程演练覆盖率', value: '100.0%', detail: '完成 52 项极端网络与硬件故障注入演练' }
            ]
          }
        ]
      },
      {
        id: 'p6',
        title: '技术稳定性委员会事故反思与承诺',
        blocks: [
          {
            type: 'quote',
            quoteText: '生产事故是对架构脆弱性最严厉的检验。技术人员最大的傲慢是对未知的忽视。我们必须将对生产系统的敬畏融入每一行代码、每一次配置变更与每一次容量演练中。',
            author: '技术委员会主席 & 首席技术官 · 生产稳定性誓约'
          }
        ]
      }
    ]
  };
  await renderDeck(postmortemDeck, {
    outPath: path.join(outDir, 'devops_presentation_incident_postmortem.pptx'),
    resolveRects: resolveSlideRects,
    forceOverwrite: true
  });
  console.log('  -> Saved devops_presentation_incident_postmortem.pptx');

  console.log('\n=== ALL 4 NEW DOMAIN PRESENTATIONS GENERATED SUCCESSFULLY ===');
}

main().catch(err => {
  console.error('Generation Failed:', err);
  process.exit(1);
});
