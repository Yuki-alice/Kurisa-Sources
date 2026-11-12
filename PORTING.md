# 移植进度（Venera-Next 漫画 + Miru 小说）

> 目标：把 Venera-Next 全量漫画源（按站点去重官方后 69 个）与 Miru repo 的 9 个小说源
> 干净重写为 Kurisa v4 契约源，写入本仓库并通过引擎测试。
> 规则：不复制原脚本；只沿用站点接口形状；`apiVersion 4`；解析用宿主 `Html.*`（自动 dispose）；
> 429/503 → `throwRateLimited`，404 → `throwNotFound`；不使用 GBK/AES/RSA（strictV4 会拒）。
> 注：`MangaDex` 与官方同名（不计入下方 69 个去重目标），但已作为重型 JSON-API 样本先行移植（`mangadex.org`）。


## 漫画（69）

> 状态说明：✅ 已移植 ｜ ⬜ 待移植 ｜ ⛔ http-only（宿主机只放行 https，无法接入）｜ ➖ 同站去重

| 上游文件 | 源名 | 状态 | 仓库 key |
|---|---|---|---|
| acg456.js | ACG456 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| acgncc.js | ACGN漫画 | ✅ 已移植 | `acgncc` |
| bainianmh.js | 百年漫画 | ⬜ 待移植 | — |
| bainianmh2.js | 百年漫画 | ✅ 已移植 | `bainianmh2` |
| bilimanga.js | 哔哩哔哩漫画 | ✅ 已移植 | `bilimanga` |
| bukamh.js | 布卡漫画 | ✅ 已移植 | `bukamh` |
| cartoonmad.js | CartoonMad | ✅ 已移植 | `cartoonmad` |
| chuixuemh.js | 吹雪漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| chuiyao.js | 吹妖漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| colamanga.js | Colamanga | ✅ 已移植 | `colamanga` |
| dashumanhua.js | 大树漫画 | ✅ 已移植 | `dashumanhua` |
| dashumanhua2.js | 大树漫画备用 | ➖ 已去重 | 与 dashumanhua 同站 |
| dingmanhua.js | 丁漫画 | ✅ 已移植 | `dingmanhua` |
| dm5.js | 动漫屋 | ⬜ 待移植 | — |
| dmzj.js | 动漫之家 | ✅ 已移植 | `dmzj.com` |
| dogemanga.js | Dogemanga | ✅ 已移植 | `dogemanga` |
| dumanwu.js | 读漫屋 | ➖ 已去重 | 与 dumanwuorg 同站，保留 https 版 |
| dumanwuorg.js | 读漫屋 | ✅ 已移植 | `dumanwuorg` |
| feixuemh.js | 飞雪漫画 | ✅ 已移植 | `feixuemh` |
| fmh.js | FMH漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| gamersky.js | GamerSky | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| gufengmh.js | 古风漫画 | ✅ 已移植 | `gufengmh.com` |
| guiluoli.js | 桂露莉漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| guomanwang.js | 国漫网 | ✅ 已移植 | `guomanwang` |
| hanhuaba.js | 韩话吧 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| haoduoman.js | 好多漫画 | ✅ 已移植 | `haoduoman.com` |
| haoduoman2.js | 好多漫画 | ➖ 已去重 | 与 haoduoman.com 同站 |
| hhxxee.js | HHXXEE | ✅ 已移植 | `hhxxee` |
| hotmanga.js | 热辣漫画备用 | ⬜ 待移植 | — |
| ikanmantw.js | 爱看漫繁体 | ⬜ 待移植 | — |
| jisumh.js | 极速漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| jpm1234.js | JPM1234 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| kanman.js | 看漫画 | ⬜ 待移植 | — |
| klmanga.js | KL漫画 | ⬜ 待移植 | — |
| mangabz.js | Mangabz | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| mangaread.js | MangaRead | ⬜ 待移植 | — |
| manhuadb.js | 漫画DB | ⬜ 待移植 | — |
| manhuaguitw.js | 漫画柜繁体 | ✅ 已移植 | `manhuaguitw` |
| manhuatai.js | 漫画台 | ⬜ 待移植 | — |
| manhuayu.js | 漫画鱼 | ✅ 已移植 | `manhuayu` |
| mh160.js | 漫画160 | ⬜ 待移植 | — |
| mh36.js | 36漫画 | ⬜ 待移植 | — |
| mh360.js | 360漫画 | ⬜ 待移植 | — |
| mh522.js | 522漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| mh57.js | MH57 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| mh92.js | 92漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| migudm.js | 咪咕动漫 | ✅ 已移植 | `migudm` |
| mkzhan.js | 快看漫画 | ⬜ 待移植 | — |
| mkzhanw.js | MKZHANW | ⬜ 待移植 | — |
| mumumh.js | 梦游漫画 | ⬜ 待移植 | — |
| mxqf.js | MX趣 | ⬜ 待移植 | — |
| pufeimh.js | 扑飞漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| qimanwu.js | 奇漫画 | ⬜ 待移植 | — |
| qimiaomh.js | 奇妙漫画 | ⬜ 待移植 | — |
| roumh.js | Rou韩漫 | ⬜ 待移植 | — |
| rumanhua.js | 入漫画 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| sfacg.js | SF轻小说 | ⬜ 待移植 | — |
| sisimanhua.js | 西西漫画 | ⬜ 待移植 | — |
| soudongman.js | 搜动漫 | ⛔ 不支持 | http-only，宿主机 https-only 白名单拒绝 |
| ttkmh.js | 天天看漫画 | ✅ 已移植 | `ttkmh` |
| u17.js | 有妖气 | ✅ 已移植 | `u17` |
| xianman123.js | 仙漫网 | ⬜ 待移植 | — |
| xmanhua.js | X漫画 | ⬜ 待移植 | — |
| xmanhua2.js | X漫画备用 | ⬜ 待移植 | — |
| yibenmanhua.js | 一本漫画 | ⬜ 待移植 | — |
| youdm.js | 优动漫 | ⬜ 待移植 | — |
| yymanhua.js | YY漫画 | ⬜ 待移植 | — |
| yymanhua2.js | YY漫画备用 | ⬜ 待移植 | — |
| zymk.js | 知音漫客 | ⬜ 待移植 | — |

## 小说（9）

| 上游文件 | 源名 | 状态 | 仓库 key |
|---|---|---|---|
| bilinovel.com.js | 哔哩轻小说 | ⬜ 待移植 | — |
| bqg.cc.js | 笔趣阁 | ⬜ 待移植 | — |
| moe.wol.wenku8.js | 轻小说文库 | ⬜ 待移植 | — |
| mydramanovel.com.js | MyDramaNovel | ⬜ 待移植 | — |
| ren.0u0.miru.mfxs.js | 免费小说网 | ⬜ 待移植 | — |
| royalroad.com.js | RoyalRoad | ✅ 已移植 | `royalroad.com` |
| vn.tangthuvien.js | Tàng thư viện | ⬜ 待移植 | — |
| wnmtl.org.js | Wnmtl | ✅ 已移植 | `wnmtl.org` |
| wtr-lab.com.js | WTR-LAB | ⬜ 待移植 | — |
