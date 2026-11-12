#!/usr/bin/env node
/**
 * 从 scripts/ 重建 index.json（与引擎安装语义逐条对齐，注释标注出处）。
 *
 *   node tools/mkindex.js          只打印将要发生的变更（dry-run）
 *   node tools/mkindex.js --write  写回 index.json（保留既有条目顺序与未知字段）
 *
 * 规则（== SourceInstaller.plan + RulesHeader + SourcesRepoContractTest）：
 * - 条目 key 必须等于文件名（去扩展名）；filename 固定为 `<key>.js` / `<key>.rules.json`；
 * - version/apiVersion/kind/domains/capabilities 取自脚本头块（js）或规则体（rules/v1）；
 * - rules capabilities 按 RulesHeader 派生：search + 有 images→comic + 有 text→novel；
 * - rules apiVersion 固定 4（ContractPolicy.LATEST_CAPABILITY_VERSION），minApp 固定 1.0.0；
 * - sha256 为文件字节小写 hex（引擎侧 toLowerCase 后比较）；
 * - 无对应文件的旧条目会被删除（悬空索引，门禁同样报错）；
 * - 新文件按 key 排序追加到末尾；未知字段原样保留。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const INDEX = path.join(ROOT, 'index.json');

const sha256hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const splitList = (s) => (s || '').split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

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

function entryFromJs(file, bytes) {
  const src = bytes.toString('utf8');
  const h = parseHeader(src);
  if (!h) throw new Error(`${file}: 头块不可解析`);
  return {
    key: h.key,
    name: h.name,
    filename: file,
    format: 'js/v1',
    version: h.version,
    apiVersion: Number(h.apiVersion),
    kind: splitList(h.kind),
    capabilities: splitList(h.capabilities),
    domains: splitList(h.domains),
    sha256: sha256hex(bytes),
    minApp: h.minApp || h.minAppVersion || '1.0.0',
  };
}

function entryFromRules(file, bytes) {
  const doc = JSON.parse(bytes.toString('utf8'));
  if (doc.format !== 'rules/v1') throw new Error(`${file}: rules 文件 format 必须为 rules/v1`);
  const caps = ['search'];
  if (doc.content && doc.content.images) caps.push('comic');
  if (doc.content && doc.content.text) caps.push('novel');
  return {
    key: doc.key,
    name: doc.name,
    filename: file,
    format: 'rules/v1',
    version: doc.version || '1.0.0',
    apiVersion: 4,
    kind: doc.kind || [],
    capabilities: caps,
    domains: doc.domains || [],
    sha256: sha256hex(bytes),
    minApp: '1.0.0',
  };
}

function main() {
  const write = process.argv.includes('--write');
  const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  const files = fs.readdirSync(SCRIPTS)
    .filter((f) => (f.endsWith('.js') || f.endsWith('.rules.json')) && !f.startsWith('_'))
    .sort();
  const built = new Map();
  for (const f of files) {
    const bytes = fs.readFileSync(path.join(SCRIPTS, f));
    const e = f.endsWith('.rules.json') ? entryFromRules(f, bytes) : entryFromJs(f, bytes);
    const expectedName = e.key + (f.endsWith('.rules.json') ? '.rules.json' : '.js');
    if (f !== expectedName) {
      console.error(`文件名与 key 不一致：${f}（应为 ${expectedName}），跳过`);
      process.exitCode = 1;
      continue;
    }
    built.set(e.key, e);
  }

  const oldByKey = new Map((index.sources || []).map((e) => [e.key, e]));
  const next = [];
  const added = [];
  const updated = [];
  for (const e of index.sources || []) {
    const b = built.get(e.key);
    if (b && e.signature && e.sha256 && e.sha256.toLowerCase() !== b.sha256.toLowerCase()) {
      console.log(`！${e.key}：sha 已变更，附带的 signature 已失效，发布前必须重新签名`);
    }
    if (!b) {
      console.log(`- 删除悬空条目：${e.key}（scripts/ 下无文件）`);
      continue;
    }
    // 保留未知字段（如未来新增的签名/描述字段），只刷新派生字段。
    const merged = { ...e };
    for (const k of ['name', 'filename', 'format', 'version', 'apiVersion', 'kind', 'capabilities', 'domains', 'sha256', 'minApp']) {
      merged[k] = b[k];
    }
    if (JSON.stringify(merged) !== JSON.stringify(e)) updated.push(e.key);
    next.push(merged);
  }
  for (const [k, b] of [...built.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (!oldByKey.has(k)) {
      added.push(k);
      next.push({ key: b.key, name: b.name, filename: b.filename, format: b.format, version: b.version, apiVersion: b.apiVersion, kind: b.kind, capabilities: b.capabilities, domains: b.domains, sha256: b.sha256, minApp: b.minApp });
    }
  }
  if (added.length) console.log(`+ 新增条目：${added.join(', ')}`);
  if (updated.length) console.log(`~ 更新条目：${updated.join(', ')}`);
  if (!added.length && !updated.length && ![...oldByKey.keys()].some((k) => !built.has(k))) {
    console.log('index.json 已是最新，无需变更。');
    return;
  }
  if (!write) {
    console.log('（dry-run，未写入；加 --write 落盘）');
    return;
  }
  index.sources = next;
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n');
  console.log('已写回 index.json。');
}

main();
