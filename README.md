# Kurisa 独立源仓库

> 与主仓分离。主仓零预置（C1）；本仓库只收干净实现的新源（看行为重写，不准抄代码，GPL 脚本禁入）。
> 规范见主仓 `docs/plugin-system/SOURCE-PACKAGE.md`（包形态）与 `docs/plugin-system/HOST-SDK.md`（宿主 API）；
> 契约见主仓 `docs/contract/source.d.ts`（v2 冻结）+ `source-v4.d.ts`（v4 增量）。

## 布局（对标 Miru：单文件一源 + 单一索引）

- `scripts/<key>.js`：js/v1 源（`class X extends ComicSource` + `// ==SourceScript==` 头块）。
- `scripts/<key>.rules.json`：rules/v1 源（纯 JSON 规则包，无 JS 引擎参与；`format: "rules/v1"`）。
  规则仅支持 HTML + CSS 选择器子集（search/detail/content）；登录、签名参数、加密章节、
  图片解密、多页拼合一律用 js/v1（见 `SOURCE-PACKAGE.md` D-2）。
- `scripts/_template.source.js`：唯一新源模板（漫画/小说二选一，删段即得；apiVersion 4）。
- `index.json`：源索引（`filename` 与 `format` 必填；sha256 与文件字节一致）。
- `index.schema.json`：索引结构校验（与引擎 `ContractPolicy.validateIndex` 对齐）。
- `tools/`：本地门禁（零依赖，Node 20+）：`npm test` 全量校验，`npm run index` 预览索引变更。

> 信任模型说明：本仓库当前无签名机制（Miru 式：信任 = 仓库本身 + PR 评审）。
> 客户端对所有源标记“未验证”并要求二次确认（引擎 `SourceInstaller` 的 `signatureMissing` 分支）。
> 如未来引入 ed25519 发布签名，届时再增 `signatures/<key>.sig` + `keys/` 公钥目录；
> 引擎侧已预留 `IndexedSource.signature` 校验位，无需改源文件。

## 本地门禁（提交前必跑）

```sh
npm test          # 语法 / 头块 / 索引一致性 / 静态扫描 / SDK 白名单 / 形状检查 / 规则校验
npm run index     # 预览 index.json 重建差异（只读）；npm run index:write 落盘
```

引擎侧门禁（需主仓检出在 `../Kurisa`）：

```sh
cd ../Kurisa && ./gradlew :source:bridge:desktopTest --tests "source.bridge.SourcesRepoContractTest" \
  -DKURISA_SOURCES_REPO="$PWD/../Kurisa-Sources"
```

## 发布

- PR 加源或升版 → 本地门禁 + 引擎门禁全绿 → 维护者签名 → 更新 index.json。
- 模板文件（`_template` 开头）不计入索引，仅供作者复制起步。
- rules/v1 新增/改动需同步通过引擎 `RulesEngineTest` 形态（search/detail/content 三段可求值）；
  复杂站点不要硬套规则，保持 js/v1。
