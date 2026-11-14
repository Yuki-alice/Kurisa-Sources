#!/usr/bin/env node
/**
 * Kurisa 源仓库离线门禁（与引擎判定逐条对齐，注释标注源码出处）。
 *
 *   npm test  ==  node tools/validate.js
 *
 * 覆盖（零网络、可离线跑）：
 *  1. SYNTAX   每个 .js 可解析（node --check），每个 .rules.json 是合法 JSON。
 *  2. HEADER   ==SourceScript== 头块可解析；字段合法性 == ContractPolicy.validateMeta。
 *  3. INDEX    index.json 条目合法性 == ContractPolicy.validateIndex；
 *              文件↔索引一致性 == SourcesRepoContractTest（key/版本/kind/sha256/文件名/去重），
 *              另加：format 与文件形态一致、kind/domains/capabilities 与头块一致。
 *  4. SCHEMA   index.schema.json == 主仓 docs/contract/index-schema.json（同一份统一契约 v2），
 *              并自检顶层版本字段 / 条目 required / url-filename 二选一 / format 与能力枚举。
 *              注意：这些文件必须保持 LF，sha256 按 LF 字节计算（见 .gitattributes）。
 *  5. SCAN     静态扫描 == SourceStaticScan.scan / scanRules（阈值逐字照搬）；
 *              另：v4 strict 下 GBK/RSA 为硬错；new HtmlDocument 为警告（统一用 Html.*）；
 *              init 内网络调用为硬错（v4 无状态约束）。
 *  6. SDK      宿主 API 白名单（对照 docs/contract/source.d.ts + source-v4.d.ts
 *              冻结集硬编码，见文件内 SDK 常量）：未知全局/方法一律报错。
 *  7. SHAPE    Node VM 实例化 + 名称空间/能力交叉检查（不执行网络；init 不调用）。
 *  8. RULES    rules/v1 JSON 结构 == RulesPackage/RulesModels：必填段、mode 仅 html、
 *              @setting: 引用存在、无 @js:（引擎无此逃生舱）。
 *
 * 退出码：错误数 > 0 时为 1；警告不影响退出码。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const child = require('node:child_process');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const INDEX = path.join(ROOT, 'index.json');
const SCHEMA = path.join(ROOT, 'index.schema.json');

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

// ---------------------------------------------------------------- 工具函数

const read = (p) => fs.readFileSync(p, 'utf8');
const sha256hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const KEY_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SHA_RE = /^[0-9a-fA-F]{64}$/;
const API_VERSIONS = new Set([2, 3, 4]);
const KINDS = new Set(['manga', 'novel', 'video', 'audio']);
const CAPABILITIES = new Set([
  'search', 'explore', 'category', 'comic', 'novel', 'account', 'favorites',
  'settings', 'translation', 'imageLoad',
  'novelChapter', 'htmlHelper', 'cryptoAes', 'video', 'audio',
]);
const MAX_SCRIPT_BYTES = 512 * 1024;

// 冻结宿主 API 面（docs/contract/source.d.ts + source-v4.d.ts，2026-11-12）。
// 未知全局/未知方法一律报错：引擎侧要么抛 CONTRACT，要么根本不存在该绑定。
const SDK = {
  Network: new Set(['get', 'post', 'put', 'patch', 'delete', 'sendRequest', 'fetchBytes', 'getCookies', 'setCookies', 'deleteCookies']),
  Html: new Set(['list', 'text', 'attr']),
  HtmlDocument: new Set(['querySelector', 'querySelectorAll', 'getElementById', 'dispose']),
  Convert: new Set(['md5', 'sha1', 'sha256', 'sha512', 'encodeBase64', 'decodeBase64', 'encodeUtf8', 'decodeUtf8', 'encodeGbk', 'decodeGbk', 'hexEncode', 'hmacString', 'hmac', 'decryptAesEcb', 'decryptAesCbc', 'decryptAesCfb', 'decryptAesOfb', 'decryptRsa']),
  Cache: new Set(['getOrPut']),
  UI: new Set(['showMessage', 'showDialog', 'launchUrl', 'showLoading', 'cancelLoading', 'showInputDialog', 'showSelectDialog']),
  Utils: new Set(['createUuid', 'randomInt', 'randomDouble']),
  APP: new Set(['locale', 'version', 'platform']),
  console: new Set(['log', 'error', 'warn']),
};
const SDK_GLOBALS = new Set([...Object.keys(SDK), 'fetch', 'setTimeout', 'throwLoginExpired', 'throwNotFound', 'throwRateLimited', 'cleanNovelHtml', 'ComicSource']);
// 宿主未注入、一律报错的全局（运行时根本不存在）。
const FORBIDDEN_GLOBALS = ['document', 'window', 'Deno', 'process', 'require', 'Java', 'XMLHttpRequest', 'Worker', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'WebSocket'];
// v4 strict 下直接抛 CONTRACT 的能力（垫片保兼容，此处按目标态报错）。
const BANNED_V4 = ['decryptRsa', 'encodeGbk', 'decodeGbk'];

/** 去注释 + 字符串字面量（保留模板字符串 ${} 内代码），供静态扫描用。 */
function stripCode(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const nx = src[i + 1];
    if (c === '/' && nx === '/') {
      const e = src.indexOf('\n', i);
      i = e < 0 ? n : e;
    } else if (c === '/' && nx === '*') {
      const e = src.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
    } else if (c === "'" || c === '"' ) {
      out += ' ';
      i++;
      while (i < n && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++;
    } else if (c === '`') {
      out += ' ';
      i++;
      let depth = 0;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`' && depth === 0) { i++; break; }
        if (src[i] === '$' && src[i + 1] === '{') {
          depth++;
          i += 2;
          const start = i;
          let d = 1;
          while (i < n && d > 0) {
            if (src[i] === '{') d++;
            else if (src[i] === '}') d--;
            i++;
          }
          out += src.slice(start, i - 1); // 保留插值内代码
          depth = 0;
          continue;
        }
        if (src[i] === '}' && depth > 0) { depth--; }
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** 解析 ==SourceScript== 头块；失败返回 null（缺失/字段不全由调用方按引擎语义判）。 */
function parseHeader(src) {
  const m = src.match(/==SourceScript==([\s\S]*?)==\/SourceScript==/);
  if (!m) return null;
  const h = {};
  for (const line of m[1].split('\n')) {
    const t = line.trim().replace(/^\/\//, '').trim();
    if (!t.startsWith('@')) continue;
    const body = t.slice(1);
    const sp = body.search(/\s/);
    if (sp < 0) continue;
    const k = body.slice(0, sp).trim();
    const v = body.slice(sp + 1).trim();
    if (k) h[k] = v;
  }
  return h;
}

const splitList = (s) => (s || '').split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

// ---------------------------------------------------------------- 文件发现

const jsFiles = fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort();
const rulesFiles = fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.rules.json') && !f.startsWith('_')).sort();

// ---------------------------------------------------------------- 1. SYNTAX

for (const f of jsFiles) {
  const p = path.join(SCRIPTS, f);
  const r = child.spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  if (r.status !== 0) err(`${f}`, `语法错误：${(r.stderr || '').split('\n')[0]}`);
}
const rulesDocs = {};
for (const f of rulesFiles) {
  const p = path.join(SCRIPTS, f);
  try {
    rulesDocs[f] = JSON.parse(read(p));
  } catch (e) {
    err(`${f}`, `JSON 解析失败：${e.message}`);
  }
}

// ---------------------------------------------------------------- 2+3. HEADER + INDEX

let index;
try {
  index = JSON.parse(read(INDEX));
} catch (e) {
  err('index.json', `解析失败：${e.message}`);
  index = null;
}

/** 与 ContractPolicy.validateIndex 对齐的条目检查（缺 format 视为 js/v1，与 IndexedSource 默认一致）。 */
function checkIndexEntry(e, i) {
  const at = `index.json#sources[${i}](${e.key || '?'})`;
  if (e.key !== undefined && !KEY_RE.test(e.key || '')) err(at, `key 非法：${e.key}`);
  if (e.version !== undefined && !SEMVER_RE.test(e.version || '')) err(at, `version 非 semver：${e.version}`);
  if (!Array.isArray(e.kind) || e.kind.length === 0) err(at, 'kind 为空');
  if (!Array.isArray(e.domains) || e.domains.length === 0) err(at, 'domains 为空');
  const fmt = e.format === undefined ? 'js/v1' : e.format;
  if (fmt !== 'js/v1' && fmt !== 'rules/v1') err(at, `format 非法：${e.format}`);
  for (const c of e.capabilities || []) {
    if (!CAPABILITIES.has(c)) err(at, `capabilities 含未知能力: ${c}`);
  }
  if (e.sha256 !== undefined && e.sha256 !== '' && !SHA_RE.test(e.sha256)) err(at, 'sha256 非法');
  const hasUrl = e.url !== undefined && e.url !== null && e.url !== '';
  const hasFile = e.filename !== undefined && e.filename !== null && e.filename !== '';
  if (hasUrl === hasFile) err(at, '须 url/filename 二选一');
}

const metas = {};   // key -> { kind:'js'|'rules', meta, file }
if (index) {
  if (!Array.isArray(index.sources)) {
    err('index.json', '缺少 sources 数组');
  } else {
    index.sources.forEach(checkIndexEntry);
    const seen = new Set();
    for (const e of index.sources) {
      if (seen.has(e.key)) err('index.json', `key 重复：${e.key}`);
      seen.add(e.key);
    }
  }
}

function validateMetaCommon(meta, where) {
  // == ContractPolicy.validateMeta
  if (!meta.name || !meta.name.trim()) err(where, 'name 为空');
  if (!KEY_RE.test(meta.key || '')) err(where, `key 非法：${meta.key}`);
  if (!SEMVER_RE.test(meta.version || '')) err(where, `version 非 semver：${meta.version}`);
  if (!SEMVER_RE.test(meta.minAppVersion || '')) err(where, `minAppVersion 非 semver：${meta.minAppVersion}`);
  if (!API_VERSIONS.has(Number(meta.apiVersion))) err(where, `apiVersion 非法：${meta.apiVersion}`);
  if (!meta.kind || meta.kind.length === 0) err(where, 'kind 为空');
  else {
    for (const k of meta.kind) {
      if (!KINDS.has(k)) err(where, `kind 非法：${k}`);
    }
  }
  if (!meta.domains || meta.domains.length === 0) err(where, 'domains 为空');
  else if (meta.domains.some((d) => !d || !d.trim())) err(where, 'domains 含空条目');
}

for (const f of jsFiles) {
  const key = f.slice(0, -3);
  const src = read(path.join(SCRIPTS, f));
  const h = parseHeader(src);
  const where = `${f}`;
  if (!h) { err(where, '头块不可解析（==SourceScript== 缺失）'); continue; }
  const meta = {
    name: h.name || '', key: h.key || '', version: h.version || '',
    minAppVersion: h.minApp || h.minAppVersion || '', apiVersion: Number(h.apiVersion),
    kind: splitList(h.kind), domains: splitList(h.domains), capabilities: splitList(h.capabilities),
    format: h.format || 'js/v1',
  };
  if (meta.format !== 'js/v1') { err(where, `js 文件声明了非 js/v1 format：${meta.format}`); continue; }
  validateMetaCommon(meta, where);
  if (meta.key && meta.key !== key) err(where, `文件名与 @key 不一致（${meta.key}）`);
  for (const c of meta.capabilities) {
    if (!CAPABILITIES.has(c)) err(where, `capabilities 含未知能力: ${c}`);
  }
  metas[key] = { kind: 'js', meta, file: f };
}

for (const f of rulesFiles) {
  const doc = rulesDocs[f];
  if (!doc) continue;
  const key = f.slice(0, -'.rules.json'.length);
  const where = `${f}`;
  const problems = [];
  if (doc.format !== 'rules/v1') problems.push('format 必须为 rules/v1');
  if (!doc.key || !doc.name) problems.push('缺 key/name');
  if (!Array.isArray(doc.kind) || doc.kind.length === 0) problems.push('kind 为空');
  if (!Array.isArray(doc.domains) || doc.domains.length === 0) problems.push('domains 为空');
  if (problems.length) { problems.forEach((p) => err(where, p)); continue; }
  const meta = {
    name: doc.name, key: doc.key, version: doc.version || '1.0.0', minAppVersion: '1.0.0',
    apiVersion: 4, kind: doc.kind, domains: doc.domains,
    capabilities: ['search', ...(doc.content && doc.content.images ? ['comic'] : []), ...(doc.content && doc.content.text ? ['novel'] : [])],
    format: 'rules/v1',
  };
  if (meta.key !== key) err(where, `文件名与 key 不一致（${meta.key}）`);
  validateMetaCommon(meta, where);
  metas[key] = { kind: 'rules', meta, file: f, doc };
}

// 索引 ↔ 文件交叉（== SourcesRepoContractTest，外加 format/文件形态一致性）
if (index && Array.isArray(index.sources)) {
  const byKey = new Map(index.sources.map((e) => [e.key, e]));
  for (const key of Object.keys(metas)) {
    const e = byKey.get(key);
    if (!e) { err(key, '脚本未登记进 index.json'); continue; }
    const m = metas[key];
    if (e.version !== m.meta.version) err(key, `索引版本 ${e.version} ≠ 头块 ${m.meta.version}`);
    const ek = [...(e.kind || [])].sort().join(',');
    const hk = [...(m.meta.kind || [])].sort().join(',');
    if (ek !== hk) err(key, `索引 kind [${ek}] ≠ 头块 [${hk}]`);
    const expectedFile = key + (m.kind === 'rules' ? '.rules.json' : '.js');
    if (e.filename !== expectedFile) err(key, `索引 filename 应为 ${expectedFile}（实际 ${e.filename}）`);
    const fmt = e.format === undefined ? 'js/v1' : e.format;
    const wantFmt = m.kind === 'rules' ? 'rules/v1' : 'js/v1';
    if (fmt !== wantFmt) err(key, `索引 format ${fmt} ≠ 脚本形态 ${wantFmt}`);
    const ed = [...(e.domains || [])].sort().join(',');
    const hd = [...(m.meta.domains || [])].sort().join(',');
    if (ed !== hd) err(key, `索引 domains [${ed}] ≠ 头块 [${hd}]`);
    const ec = [...(e.capabilities || [])].sort().join(',');
    const hc = [...(m.meta.capabilities || [])].sort().join(',');
    if (ec !== hc) err(key, `索引 capabilities [${ec}] ≠ 头块 [${hc}]`);
    const bytes = fs.readFileSync(path.join(SCRIPTS, m.file));
    const sha = sha256hex(bytes);
    if ((e.sha256 || '').toLowerCase() !== sha) err(key, '索引 sha256 与脚本字节不一致');
  }
  const fileKeys = new Set(Object.keys(metas));
  for (const e of index.sources) {
    if (!fileKeys.has(e.key)) err(e.key, '索引条目在 scripts/ 下无对应文件');
  }
}

// ---------------------------------------------------------------- 4. SCHEMA 自检

try {
  const schema = JSON.parse(read(SCHEMA));
  const rootProps = schema.properties || {};
  // 统一契约 v2：顶层 apiVersion 与旧仓 version 二者至少声明一个。
  if (!rootProps.apiVersion && !rootProps.version) {
    err('index.schema.json', '顶层需声明 apiVersion 或 version');
  }
  const item = (rootProps.sources || {}).items || {};
  const req = item.required || [];
  // 只锁三条真正影响安装的必填项；apiVersion/kind/domains/sha256 由下方 INDEX 段逐条校验，
  // 不再要求写进 required——统一契约允许条目继承顶层 apiVersion、且 url/filename 二选一。
  for (const field of ['key', 'name', 'version']) {
    if (!req.includes(field)) err('index.schema.json', `required 必须包含 ${field}（与引擎 validateIndex 对齐）`);
  }
  const oneOf = item.oneOf || [];
  const hasFilename = oneOf.some((c) => (c.required || []).includes('filename'));
  const hasUrl = oneOf.some((c) => (c.required || []).includes('url'));
  if (!hasFilename || !hasUrl) {
    err('index.schema.json', '条目需以 oneOf 声明 url/filename 二选一');
  }
  const itemProps = item.properties || {};
  const fmtEnum = (itemProps.format || {}).enum || [];
  if (!fmtEnum.includes('js/v1') || !fmtEnum.includes('rules/v1')) {
    err('index.schema.json', 'format 需声明 enum [js/v1, rules/v1]');
  }
  // 能力枚举必须覆盖 Kotlin SourceCapability 全量（含 v4 的 video/audio），否则 schema 比引擎保守。
  const capEnum = ((itemProps.capabilities || {}).items || {}).enum || [];
  const missingCaps = [...CAPABILITIES].filter((c) => !capEnum.includes(c));
  if (missingCaps.length) {
    err('index.schema.json', `capabilities 枚举缺 ${missingCaps.join(',')}（与 SourceCapability 不一致）`);
  }
  const kindEnum = ((itemProps.kind || {}).items || {}).enum;
  if (kindEnum && ![...KINDS].every((k) => kindEnum.includes(k))) {
    warn('index.schema.json', 'kind 枚举建议覆盖 manga/novel/video/audio');
  }
} catch (e) {
  err('index.schema.json', `解析失败：${e.message}`);
}

// ---------------------------------------------------------------- 5. 静态扫描（阈值逐字对齐 SourceStaticScan）

function scanCommon(src, domains, where, isRules) {
  const bytes = Buffer.byteLength(src, 'utf8');
  if (bytes > MAX_SCRIPT_BYTES) err(where, `脚本超大（>${MAX_SCRIPT_BYTES}B，拒绝）`);
  const scanRe = isRules ? /https?:\/\/([A-Za-z0-9.\-]+)/g : /https:\/\/([A-Za-z0-9.\-]+)/g;
  const hosts = [...new Set([...src.matchAll(scanRe)].map((m) => m[1].toLowerCase()))];
  const declared = new Set(domains.map((d) => d.toLowerCase().replace(/^\./, '')));
  const outsiders = hosts.filter((h) => ![...declared].some((d) => h === d || h.endsWith('.' + d)));
  if (outsiders.length) warn(where, `白名单外域名：${outsiders.slice(0, 5).join(',')}`);
  const lines = src.split('\n');
  const maxLine = lines.reduce((a, l) => Math.max(a, l.length), 0);
  if (maxLine > 5000) warn(where, `超长单行（${maxLine} 字符，疑似混淆）`);
  const escapes = (src.match(/\\x[0-9a-fA-F]{2}/g) || []).length;
  if (escapes > 20) warn(where, `大量 \\x 转义（${escapes} 处，疑似混淆）`);
}

function scanJs(src, file, domains) {
  const where = file;
  const code = stripCode(src);
  if (code.includes('eval(') || code.includes('new Function')) warn(where, '含动态 eval/Function 构造');
  if (/^\s*import[\s('"]/m.test(code)) warn(where, '含 ESM import（宿主拒绝一切模块导入）');
  if (/\brequire\s*\(/.test(code)) warn(where, '含 CommonJS require（无 CJS 加载器）');
  for (const g of ['Deno', 'XMLHttpRequest', 'Worker', 'localStorage', 'sessionStorage', 'navigator']) {
    if (new RegExp(`\\b${g}\\b`).test(code)) err(where, `含未注入全局 ${g}`);
  }
  if (/\bprocess\s*\.\s*env\b/.test(code)) err(where, '含 Node process.env（宿主未注入）');
  if (/\bJava\s*\.\s*type\b/.test(code)) err(where, '含 Java.type 桥接（宿主无 Java 反射）');
  if (/\bdocument\b/.test(code)) err(where, '含 document（宿主未注入 DOM）');
  if (/\bwindow\b/.test(code)) err(where, '含 window（宿主未注入）');
  if (/while\s*\(\s*true\s*\)/.test(code)) warn(where, '含 while(true) 模式（运行时有 10s 中断保护）');
  // v4 strict：GBK/RSA 直接抛 CONTRACT，禁止出现在源里。
  for (const api of ['decryptRsa', 'encodeGbk', 'decodeGbk']) {
    if (new RegExp(`\\b${api}\\b`).test(code)) err(where, `v4 strict 禁用 ${api}（宿主抛 CONTRACT）`);
  }
  // 统一用 Html.* helper（自动 dispose），new HtmlDocument 判为警告。
  if (/\bnew\s+HtmlDocument\b/.test(code)) warn(where, 'new HtmlDocument：请改用 Html.list/text/attr（自动 dispose）');
  scanCommon(src, domains, where, false);
  // SDK 方法面白名单
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g)) {
    const full = m[0];
    const root = m[1];
    const name = m[2];
    if (root === 'el' || root === 'this' || root === 'res' || root === 'json' || root === 'JSON') continue;
    if (SDK_GLOBALS.has(root)) {
      if (SDK[root] && !SDK[root].has(name)) err(where, `未知宿主 API：${full}`);
    }
  }
}

function scanRulesDoc(doc, file, domains) {
  const where = file;
  const raw = JSON.stringify(doc);
  scanCommon(raw, domains, where, true);
  const s = JSON.stringify(doc.search || {});
  const hits = [...s.matchAll(/@setting:([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  const declared = new Set(Object.keys(doc.settings || {}));
  for (const h of hits) {
    if (!declared.has(h)) err(where, `@setting:${h} 未在 settings 声明`);
  }
  const all = raw;
  if (/(^|[^A-Za-z0-9_@$])@js\b/.test(all)) err(where, '含 @js: 逃生舱写法（规则引擎不支持，请改用 js/v1）');
}

for (const f of jsFiles) {
  const src = read(path.join(SCRIPTS, f));
  const key = f.slice(0, -3);
  const domains = (metas[key] && metas[key].meta.domains) || [];
  scanJs(stripHeader(src), f, domains);
}

function stripHeader(src) {
  // 头块注释不参与扫描（避免 @domains 等声明被误判为外链）。
  return src.replace(/==SourceScript==[\s\S]*?==\/SourceScript==/, '');
}

// ---------------------------------------------------------------- 6+7. SHAPE（VM 实例化，不执行网络；init 不调用）

function makeSandbox() {
  const kv = new Map();
  class ComicSource {
    constructor() { this.translation = {}; }
    loadData(k) { const v = kv.get(String(k)); return v === undefined ? null : v; }
    saveData(k, v) { kv.set(String(k), String(v)); }
    deleteData(k) { kv.delete(String(k)); }
    loadSetting(k) {
      const v = kv.get('setting:' + String(k));
      if (v !== undefined) return v;
      const s = (this.settings || {})[k];
      if (s && s.default !== undefined && s.default !== null) return String(s.default);
      return null;
    }
    get isLogged() { return false; }
    translate(k) { const t = (this.translation || {}).zh_CN || {}; return t[k] !== undefined ? t[k] : k; }
  }
  const noCall = (name) => { throw new Error(`must not call during shape check: ${name}`); };
  return {
    ComicSource,
    Network: new Proxy({}, { get: (_, p) => (...a) => noCall(`Network.${String(p)}`) }),
    Html: new Proxy({}, { get: (_, p) => (...a) => noCall(`Html.${String(p)}`) }),
    HtmlDocument: class { constructor() { noCall('new HtmlDocument'); } },
    Convert: new Proxy({}, { get: (_, p) => (...a) => noCall(`Convert.${String(p)}`) }),
    Cache: { getOrPut: (...a) => noCall('Cache.getOrPut') },
    UI: new Proxy({}, { get: (_, p) => (...a) => noCall(`UI.${String(p)}`) }),
    Utils: { createUuid: () => 'uuid', randomInt: (a, b) => a, randomDouble: () => 0 },
    APP: { locale: 'zh_CN', version: '1.0.0', platform: 'test' },
    console: { log() {}, error() {}, warn() {} },
    fetch: (...a) => noCall('fetch'),
    setTimeout: (...a) => noCall('setTimeout'),
    throwLoginExpired: (m) => { throw new Error('Login expired' + (m ? ': ' + m : '')); },
    throwNotFound: (m) => { throw new Error('NotFound' + (m ? ': ' + m : '')); },
    throwRateLimited: (m) => { throw new Error('Rate limited' + (m ? ': ' + m : '')); },
    cleanNovelHtml: (s) => String(s),
  };
}

function checkShape(file, src) {
  const where = file;
  const names = [...src.matchAll(/class\s+([A-Za-z_$][\w$]*)\s+extends\s+ComicSource/g)].map((m) => m[1]);
  if (names.length !== 1) { err(where, `应恰好 1 个 ComicSource 子类，实际 ${names.length}`); return; }
  const sandbox = makeSandbox();
  vm.createContext(sandbox);
  let Cls;
  try {
    Cls = vm.runInContext(src + `\n;(${names[0]});`, sandbox, { filename: file });
  } catch (e) {
    err(where, `求值失败：${e.message}`);
    return;
  }
  let inst;
  try {
    inst = new Cls();
  } catch (e) {
    err(where, `构造失败（宿主同样无法 new）：${e.message}`);
    return;
  }
  const caps = new Set((inst.capabilities || []));
  const need = (cond, msg) => { if (!cond) err(where, msg); };
  const isFn = (v) => typeof v === 'function';
  // init 禁止网络副作用（v4 无状态约束）。
  if (inst.init !== undefined) {
    const body = Function.prototype.toString.call(inst.init);
    if (/Network\.|[^a-zA-Z]fetch\s*\(|sendMessage\s*\(/.test(body)) {
      err(where, 'init 含网络调用（v4 禁止网络副作用，仅允许 KV 预热）');
    }
  }
  if (caps.has('search')) {
    const s = inst.search || {};
    need(isFn(s.load) || isFn(s.page) || isFn(s.loadNext), 'search 需 load/page/loadNext 三者之一');
    if (Array.isArray(s.optionList)) {
      s.optionList.forEach((o, i) => {
        if (!o || !Array.isArray(o.options) || o.options.length === 0) {
          warn(where, `search.optionList[${i}] 为空（宿主按首项生成 options，空组传 null 会崩）`);
        }
      });
    }
  }
  if (caps.has('comic')) {
    need(inst.comic && isFn(inst.comic.loadInfo), 'comic.loadInfo 缺失');
    need(inst.comic && isFn(inst.comic.loadEp), 'comic.loadEp 缺失');
  }
  if (caps.has('novel')) {
    need(inst.novel && isFn(inst.novel.loadInfo), 'novel.loadInfo 缺失');
    need(inst.novel && isFn(inst.novel.loadChapter), 'novel.loadChapter 缺失');
  }
  if (caps.has('imageLoad')) {
    need(isFn(inst.comic && inst.comic.onImageLoad) || isFn(inst.novel && inst.novel.onImageResolve), 'imageLoad 需 onImageLoad/onImageResolve');
    const fn = inst.comic && inst.comic.onImageLoad;
    if (isFn(fn)) {
      try {
        const r = fn('https://example.invalid/x.jpg', 'w', 'c');
        if (r === null || typeof r !== 'object' || Array.isArray(r)) {
          err(where, 'onImageLoad 须返回对象（{url?, headers?}）');
        }
      } catch (e) {
        warn(where, `onImageLoad 在合成输入下抛错：${e.message}`);
      }
    }
  }
  if (caps.has('explore')) {
    need(Array.isArray(inst.explore), 'explore 应为数组');
    (inst.explore || []).forEach((pg, i) => {
      if (!pg || (!isFn(pg.load) && !isFn(pg.loadNext))) warn(where, `explore[${i}] 缺 load/loadNext`);
    });
  }
  if (caps.has('category')) {
    need(inst.categoryComics && isFn(inst.categoryComics.load), 'category 需 categoryComics.load');
  }
  if (caps.has('account')) {
    const a = inst.account || {};
    need(isFn(a.login) || isFn(a.loginWithWebview) || isFn(a.loginWithCookies) || isFn(a.logout), 'account 需至少一个登录/登出入口');
  }
  if (caps.has('settings')) {
    need(inst.settings && typeof inst.settings === 'object', 'settings 缺失（capabilities 含 settings）');
    for (const [k, s] of Object.entries(inst.settings || {})) {
      if (!s || typeof s.title !== 'string') { err(where, `settings.${k} 缺 title`); continue; }
      if (s.type === 'select' && (!Array.isArray(s.options) || s.options.length === 0)) {
        err(where, `settings.${k} select 缺 options`);
      }
    }
  }
  if (caps.has('translation')) {
    need(inst.translation && typeof inst.translation === 'object', 'translation 缺失');
  }
}

// ---------------------------------------------------------------- 8. RULES 结构（== RulesEngine.load + describe 语义）

function checkRules(file, doc) {
  const where = file;
  const nonEmptyStr = (v) => typeof v === 'string' && v.length > 0;
  // search
  if (!doc.search || typeof doc.search !== 'object') { err(where, '缺 search 段'); }
  else {
    if ((doc.search.mode || 'html') !== 'html') err(where, `mode 仅支持 html（实际 ${doc.search.mode}）`);
    if (!nonEmptyStr(doc.search.list)) err(where, 'search.list 为空');
    if (!doc.search.request || !nonEmptyStr(doc.search.request.url)) err(where, 'search.request.url 为空');
  }
  // detail
  if (!doc.detail || typeof doc.detail !== 'object') { err(where, '缺 detail 段'); }
  else {
    if ((doc.detail.mode || 'html') !== 'html') err(where, `detail mode 仅支持 html`);
    const ch = doc.detail.chapters || {};
    if (!nonEmptyStr(ch.list)) err(where, 'detail.chapters.list 为空');
  }
  // content 二选一（与引擎分支一致：images 优先，text 其次，两者皆无抛 CONTRACT）
  const c = doc.content || {};
  if (!c.images && !c.text) { err(where, 'content 须含 images 或 text'); }
  if (c.images && !nonEmptyStr(c.images.list)) err(where, 'content.images.list 为空');
  if (c.text && !nonEmptyStr(c.text.select)) err(where, 'content.text.select 为空');
  if (c.images && c.text) warn(where, 'content 同时含 images 与 text（引擎只用 images）');
  // settings
  for (const [k, s] of Object.entries(doc.settings || {})) {
    if (!s || typeof s !== 'object') { err(where, `settings.${k} 非法`); continue; }
    if (!['select', 'switch', 'input', 'callback'].includes(s.type)) warn(where, `settings.${k}.type 未知：${s.type}`);
    if (s.type === 'select' && (!Array.isArray(s.options) || s.options.length === 0)) {
      err(where, `settings.${k} select 缺 options`);
    }
  }
  // 未知顶层段：引擎 ignoreUnknownKeys，提示作者确认（防拼写错误导致静默失效）。
  for (const k of Object.keys(doc)) {
    if (!['format', 'key', 'name', 'version', 'kind', 'domains', 'baseUrl', 'search', 'detail', 'content', 'settings'].includes(k)) {
      warn(where, `未知顶层字段（引擎忽略）：${k}`);
    }
  }
}

// ---------------------------------------------------------------- 执行

for (const f of jsFiles) {
  const src = read(path.join(SCRIPTS, f));
  checkShape(f, src);
}
for (const f of rulesFiles) {
  const doc = rulesDocs[f];
  if (doc) checkRules(f, doc);
}

// ---------------------------------------------------------------- 报告

console.log(`kurisa-sources 门禁：${jsFiles.length} js / ${rulesFiles.length} rules`);
if (warnings.length) {
  console.log(`\n警告（${warnings.length}，不阻断）：`);
  for (const w of warnings) console.log('  ⚠ ' + w);
}
if (errors.length) {
  console.log(`\n错误（${errors.length}）：`);
  for (const e of errors) console.log('  ✘ ' + e);
  process.exit(1);
} else {
  console.log('\n全部通过（0 错误）。');
}
