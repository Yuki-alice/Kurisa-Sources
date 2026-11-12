// ==SourceScript==
// @name        Tàng thư viện
// @key         tangthuvien.vn
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        novel
// @domains     truyen.tangthuvien.vn
// @capabilities search,novel,novelChapter,explore,htmlHelper
// ==/SourceScript==

/**
 * Kurisa v4 源：Tàng thư viện（越南语小说，服务端 HTML）。
 * 数据流改写自 MIT 许可的公开实现（仅沿用其站点接口：路径、选择器与卷/章结构；
 * 未复制原脚本）。
 * 差异：
 * - 原稿自带 60+ 行越南语实体映射表；宿主 Html 基于 Ksoup，`.text` 已解码实体，故移除。
 * - 原稿目录是「卷 → 章」两级；Kurisa 章节为扁平数组，按 `卷名 · 章名` 前缀保留归属。
 * 反爬分类：429/503 → throwRateLimited；404 → throwNotFound。
 */
class TangThuVien extends ComicSource {
  constructor() {
    super();
    this.name = 'Tàng thư viện';
    this.key = 'tangthuvien.vn';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['novel'];
    this.domains = ['truyen.tangthuvien.vn'];
    this.capabilities = ['search', 'novel', 'novelChapter', 'explore', 'htmlHelper'];
  }

  baseUrl() {
    return 'https://truyen.tangthuvien.vn';
  }

  async fetchOk(path) {
    const res = await Network.get(this.baseUrl() + path, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0'
    });
    if (res.status === 429 || res.status === 503) throwRateLimited('Tàng thư viện 访问受限：' + res.status);
    if (res.status === 404) throwNotFound('页面不存在：' + path);
    if (res.status !== 200) throw new Error('Tàng thư viện 请求失败: ' + res.status);
    return res.body;
  }

  parseList(body) {
    return Html.list(body, '.book-img-text li', (el) => {
      const html = el.innerHtml;
      const href = Html.attr(html, 'a', 'href') || '';
      const marker = '/doc-truyen/';
      const idx = href.indexOf(marker);
      if (idx < 0) return null;
      const slug = href.substring(idx + marker.length);
      const title = Html.text(html, 'a').trim();
      if (!slug || !title) return null;
      return {
        id: '/doc-truyen/' + slug,
        title: title,
        cover: Html.attr(html, 'img', 'src') || ''
      };
    }).filter(Boolean);
  }

  explore = [{
    title: 'Tàng thư viện',
    type: 'multiPageComicList',
    load: async (page) => {
      const body = await this.fetchOk('/tong-hop?rank=vw&page=' + page);
      const items = this.parseList(body).map((w) => ({ ...w, kind: 'novel' }));
      const result = {};
      if (items.length) result['热门'] = items;
      return result;
    }
  }];

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const body = await this.fetchOk(
        '/ket-qua-tim-kiem?term=' + encodeURIComponent(keyword) + '&page=' + page
      );
      return {
        works: this.parseList(body).map((w) => ({ ...w, kind: 'novel' })),
        maxPage: page + 1
      };
    },
    page: async (keyword, options, pageOrNext) => {
      if (typeof pageOrNext === 'number') return await this.search.load(keyword, options, pageOrNext);
      return { works: [], maxPage: 1 };
    }
  };

  novel = {
    loadInfo: async (id) => {
      const body = await this.fetchOk(id);
      const title = Html.text(body, 'h1').trim() || id;
      const cover = Html.attr(body, '#bookImg img', 'src') || '';
      const desc = Html.text(body, '.book-intro').trim();
      // story_id 取自详情页隐藏 input（原稿同源）。
      const storyId = Html.attr(body, 'input[name="story_id"]', 'value') ||
        Html.attr(body, 'input[type="hidden"]', 'value') || '';
      let chapters = [];
      if (storyId) {
        const toc = await this.fetchOk('/story/chapters?story_id=' + encodeURIComponent(storyId));
        // 原稿为「卷 → 章」两级；Kurisa 目录是扁平数组，此处按站点自然顺序展开
        // （卷归属如需保留，靠章节名自身携带，或待契约扩展分组字段）。
        chapters = Html.list(toc, 'ul li a', (el) => {
          const href = el.attributes && el.attributes.href ? el.attributes.href : '';
          const name = el.text.trim();
          if (!href || !name) return null;
          return { id: href.replace(this.baseUrl(), ''), title: name };
        }).filter(Boolean);
      }
      return { title: title, cover: cover, description: desc, chapters: chapters };
    },
    loadChapter: async (workId, chapterId) => {
      const path = chapterId.indexOf('http') === 0 ? chapterId.replace(this.baseUrl(), '') : chapterId;
      const body = await this.fetchOk(path.indexOf('/') === 0 ? path : '/' + path);
      const raw = Html.text(body, '.box-chap');
      const paras = raw
        .split(/\r?\n/)
        .map(function (t) { return t.trim(); })
        .filter(function (t) { return t.length > 0; });
      return { content: paras.join('\n'), format: 'plain' };
    }
  };
}
