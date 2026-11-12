# 移植进度（Venera-Next 漫画 + Miru 小说）

> 目标：把 Venera-Next 全量漫画源（按站点去重官方后 69 个）与 Miru repo 的 9 个小说源
> 干净重写为 Kurisa v4 契约源，写入本仓库并通过引擎测试。
> 规则：不复制原脚本；只沿用站点接口形状；`apiVersion 4`；解析用宿主 `Html.*`（自动 dispose）；
> 429/503 → `throwRateLimited`，404 → `throwNotFound`；不使用 GBK/AES/RSA（strictV4 会拒）。
> 注：`MangaDex` 与官方同名（不计入下方 69 个去重目标），但已作为重型 JSON-API 样本先行移植（`mangadex.org`）。


## 漫画（69）

> key 一律为反向域名形态（契约 `validateMeta` 要求至少两段、字母开头）；不含连字符的域名可用下划线。
> 状态说明：✅ 已移植 ｜ ⬜ 待移植 ｜ ⛔ http-only（宿主机只放行 https，无法接入）｜ ➖ 同站去重

| 上游文件 | 源名 | 状态 | 仓库 key |
|---|---|---|---|
| acg456.js | ACG456 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| acgncc.js | ACGN漫画 | ✅ 已移植 | `acgn.cc` |
| bainianmh.js | 百年漫画 | ✅ 已移植 | `bnman.net` |
| bainianmh2.js | 百年漫画 | ✅ 已移植 | `bainianmh2` |
| bilimanga.js | 哔哩哔哩漫画 | ✅ 已移植 | `bilimanga.net` |
| bukamh.js | 布卡漫画 | ✅ 已移植 | `bukamh.org` |
| cartoonmad.js | CartoonMad | ✅ 已移植 | `cartoonmad.com` |
| chuixuemh.js | 吹雪漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| chuiyao.js | 吹妖漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| colamanga.js | Colamanga | ✅ 已移植 | `colamanga.com` |
| dashumanhua.js | 大树漫画 | ✅ 已移植 | `dashumanhua.com` |
| dashumanhua2.js | 大树漫画备用 | ➖ 已去重 | 与 dashumanhua 同站 |
| dingmanhua.js | 丁漫画 | ✅ 已移植 | `dingmanhua.com` |
| dm5.js | 动漫屋 | ✅ 已移植 | `dm5.com` |
| dmzj.js | 动漫之家 | ✅ 已移植 | `dmzj.com` |
| dogemanga.js | Dogemanga | ✅ 已移植 | `dogemanga.com` |
| dumanwu.js | 读漫屋 | ➖ 已去重 | 与 dumanwuorg 同站，保留 https 版 |
| dumanwuorg.js | 读漫屋 | ✅ 已移植 | `dumanwu.org` |
| feixuemh.js | 飞雪漫画 | ✅ 已移植 | `feixuemh.com` |
| fmh.js | FMH漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| gamersky.js | GamerSky | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| gufengmh.js | 古风漫画 | ✅ 已移植 | `gufengmh.com` |
| guiluoli.js | 桂露莉漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| guomanwang.js | 国漫网 | ✅ 已移植 | `guomanwang.com` |
| hanhuaba.js | 韩话吧 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| haoduoman.js | 好多漫画 | ✅ 已移植 | `haoduoman.com` |
| haoduoman2.js | 好多漫画 | ➖ 已去重 | 与 haoduoman.com 同站 |
| hhxxee.js | HHXXEE | ✅ 已移植 | `hhxxee.com` |
| hotmanga.js | 热辣漫画备用 | ➖ 已去重 | 与官方 热辣漫画 同站（备用域名） |
| ikanmantw.js | 爱看漫繁体 | ➖ 已去重 | 与 manhuaguitw 同站（tw.manhuagui.com） |
| jisumh.js | 极速漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| jpm1234.js | JPM1234 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| kanman.js | 看漫画 | ✅ 已移植 | `kanman.com` |
| klmanga.js | KL漫画 | ✅ 已移植 | `klmanga.com` |
| mangabz.js | Mangabz | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| mangaread.js | MangaRead | ✅ 已移植 | `mangaread.org` |
| manhuadb.js | 漫画DB | ✅ 已移植 | `manhua666.cc` |
| manhuaguitw.js | 漫画柜繁体 | ✅ 已移植 | `manhuagui.com` |
| manhuatai.js | 漫画台 | ➖ 已去重 | 与 kanman.com 同站（www.kanman.com） |
| manhuayu.js | 漫画鱼 | ✅ 已移植 | `manhuayu88.com` |
| mh160.js | 漫画160 | ✅ 已移植 | `mh160mh.com` |
| mh36.js | 36漫画 | ✅ 已移植 | `mh36.site` |
| mh360.js | 360漫画 | ✅ 已移植 | `mh360.site` |
| mh522.js | 522漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| mh57.js | MH57 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| mh92.js | 92漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| migudm.js | 咪咕动漫 | ✅ 已移植 | `migudm.cn` |
| mkzhan.js | 快看漫画 | ✅ 已移植 | `mkzhan.com` |
| mkzhanw.js | MKZHANW | ✅ 已移植 | `mkzhanw` |
| mumumh.js | 梦游漫画 | ✅ 已移植 | `mumumh.com` |
| mxqf.js | MX趣 | ✅ 已移植 | `mxshm.top` |
| pufeimh.js | 扑飞漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| qimanwu.js | 奇漫画 | ✅ 已移植 | `qimanwu.org` |
| qimiaomh.js | 奇妙漫画 | ✅ 已移植 | `qimiaomh.com` |
| roumh.js | Rou韩漫 | ✅ 已移植 | `roumh.com` |
| rumanhua.js | 入漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| sfacg.js | SF轻小说 | ✅ 已移植 | `sfacg.com` |
| sisimanhua.js | 西西漫画 | ✅ 已移植 | `sisimanhua.com` |
| soudongman.js | 搜动漫 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| ttkmh.js | 天天看漫画 | ✅ 已移植 | `ttkmh.com` |
| u17.js | 有妖气 | ✅ 已移植 | `u17.com` |
| xianman123.js | 仙漫网 | ✅ 已移植 | `xianman123.com` |
| xmanhua.js | X漫画 | ✅ 已移植 | `xmanhua.com` |
| xmanhua2.js | X漫画备用 | ➖ 已去重 | 与 xmanhua 同站 |
| yibenmanhua.js | 一本漫画 | ✅ 已移植 | `yibenmanhua.com` |
| youdm.js | 优动漫 | ✅ 已移植 | `udm123.com` |
| yymanhua.js | YY漫画 | ➖ 已去重 | 与 yymanhua 同站 |
| yymanhua2.js | YY漫画备用 | ➖ 已去重 | 与 yymanhua 同站 |
| zymk.js | 知音漫客 | ✅ 已移植 | `zymk.cn` |

## 小说（9）

| 上游文件 | 源名 | 状态 | 仓库 key |
|---|---|---|---|
| bilinovel.com.js | 哔哩轻小说 | ⛔ 不移植 | ⛔ 不移植：核心为字体混淆字符映射表（约 3600 条，数据级复制违反“干净实现”纪律；重造需逆向站点字体），另含多页章节拼装与自定义 $api |
| bqg.cc.js | 笔趣阁 | ✅ 已移植 | `bqg.cc` |
| moe.wol.wenku8.js | 轻小说文库 | ⛔ 不移植 | ⛔ 不移植：依赖第三方中转 miru-wenku8.wol.moe（站外未知供应链），并内嵌 CryptoJS + fast-xml-parser；直连需自研加密请求体与 XML 解析 |
| mydramanovel.com.js | MyDramaNovel | ✅ 已移植 | `mydramanovel.com` |
| ren.0u0.miru.mfxs.js | 免费小说网 | ✅ 已移植 | `mfxs.www493d` |
| royalroad.com.js | RoyalRoad | ✅ 已移植 | `royalroad.com` |
| vn.tangthuvien.js | Tàng thư viện | ✅ 已移植 | `tangthuvien.vn` |
| wnmtl.org.js | Wnmtl | ✅ 已移植 | `wnmtl.org` |
| wtr-lab.com.js | WTR-LAB | ✅ 已移植 | `wtr_lab.com` |
