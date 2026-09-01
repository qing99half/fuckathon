// 构建期内容校验：引用完整性 / 概率 0-1 / 字数上限 / 结局兜底
import {
  HYPES, PATRONS, TITLE_TIERS, SPONSORS, JUDGES, EVENT_CARDS,
  BARRAGES, TEAMS, ENDINGS,
} from '../src/engine/data';

let errors = 0;
const err = (msg: string) => { errors++; console.error('✗ ' + msg); };
const ok = (msg: string) => console.log('✓ ' + msg);

// 1. 概率合法
for (const e of EVENT_CARDS) {
  if (e.prob < 0 || e.prob > 1) err(`${e.id} prob=${e.prob} 越界`);
  for (const k of ['probPlusIfTier3', 'probPlusIfBuzz60', 'probPlusPerSponsor', 'probMax'] as const) {
    const v = e[k];
    if (v !== undefined && (v < 0 || v > 1)) err(`${e.id} ${k}=${v} 越界`);
  }
}
ok('概率全部在 0-1');

// 2. 引用完整性
const patronIds = new Set(PATRONS.map(p => p.id));
const sponsorIds = new Set(SPONSORS.map(s => s.id));
for (const j of JUDGES) {
  if (j.needsPatron && !patronIds.has(j.needsPatron)) err(`评委 ${j.id} needsPatron=${j.needsPatron} 不存在`);
  if (j.needsSponsor && !sponsorIds.has(j.needsSponsor)) err(`评委 ${j.id} needsSponsor=${j.needsSponsor} 不存在`);
}
const whenKeys = new Set(['govRelated', 'badWifi', 'badLodgingOrMeal', 'hasSponsors', 'hasCryptoJudge', 'hasStreamerJudge', 'chaos4', 'chaos6', 'namingAwards3']);
for (const e of EVENT_CARDS) {
  if (e.when && !whenKeys.has(e.when)) err(`${e.id} when=${e.when} 未在引擎注册`);
}
ok('引用完整性通过');

// 3. 字数上限（正文 ≤120 字，选项 label ≤30 字）
for (const e of EVENT_CARDS) {
  if (e.body.length > 160) err(`${e.id} 正文 ${e.body.length} 字过长`);
  for (const o of e.options) {
    if (o.label.length > 32) err(`${e.id}:${o.id} 选项 ${o.label.length} 字过长`);
  }
}
ok('字数检查完成');

// 4. 结局表：priority 唯一且有兜底
const prios = new Set(ENDINGS.map(e => e.priority));
if (prios.size !== ENDINGS.length) err('结局 priority 有重复');
if (!ENDINGS.some(e => Object.keys(e.when).length === 0)) err('结局缺兜底（when 为空）');
const noSet = new Set(ENDINGS.map(e => e.no));
if (noSet.size !== ENDINGS.length) err('结局红头文号重复');
ok(`结局 ${ENDINGS.length} 张，兜底存在`);

// 5. 弹幕池
for (const t of ['A', 'B', 'C'] as const) {
  if (BARRAGES[t].length < 15) err(`弹幕 ${t} 档不足 15 条`);
}
const linkedUsed = ['meal_15', 'meal_60', 'wifi_bad', 'speech_dead', 'award_token',
  'rig_fair', 'rig_rigged', 'rig_water', 'sponsor_3', 'sponsor_5', 'sponsor_0', 'bloat', 'inflation'];
for (const k of linkedUsed) {
  if (!BARRAGES.linked[k]?.length) err(`联动弹幕 ${k} 缺失`);
}
ok(`弹幕 A/B/C 各 ${BARRAGES.A.length}/${BARRAGES.B.length}/${BARRAGES.C.length} 条，联动 ${Object.keys(BARRAGES.linked).length} 键`);

// 6. 池子规模
if (HYPES.length < 12) err('风口不足 12 个');
if (SPONSORS.length < 10) err('赞助商不足 10 家');
if (JUDGES.length < 12) err('评委不足 12 人');
if (TEAMS.projects.length < 15) err('梗项目不足 15 个');
for (const t of TITLE_TIERS) if (t.templates.length < 3) err(`Title 第 ${t.tier} 档模板不足 3`);
ok('风口/赞助/评委/项目/Title 池规模达标');

if (errors) { console.error(`\n共 ${errors} 个错误`); process.exit(1); }
console.log('\n全部校验通过');
