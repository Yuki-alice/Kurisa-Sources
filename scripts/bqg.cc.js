// ==SourceScript==
// @name        笔趣阁
// @key         bqg.cc
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        novel
// @domains     m.bi17.cc
// @capabilities search,novel,novelChapter,settings,htmlHelper
// ==/SourceScript==

/**
 * Kurisa v4 源：笔趣阁（中文小说，JSON 列表接口 + HTML 详情/正文）。
 * 数据流改写自 MIT 许可的公开实现（仅沿用其站点接口：接口路径、meta 字段与选择器；
 * 未复制原脚本；方法体按 Kurisa v4 API 重写）。
 * 差异：分页连载正文改为**有界循环**（最多 50 页），原稿 while(true) 依赖链接终止。
 * 反爬分类：429/503 → throwRateLimited；404 → throwNotFound。
 */
class Bqg extends ComicSource {
  constructor() {
    super();
    this.name = '笔趣阁';
    this.key = 'bqg.cc';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['novel'];
    this.domains = ['m.bi17.cc'];
    this.capabilities = ['search', 'novel', 'novelChapter', 'settings', 'htmlHelper'];
    this.settings = {
      defaultCategory: {
        title: '默认类别',
        type: 'select',
        options: [
          { value: '1', text: '玄幻' }, { value: '2', text: '武侠' }, { value: '3', text: '都市' },
          { value: '4', text: '历史' }, { value: '6', text: '科幻' }, { value: '5', text: '网游' },
          { value: '7', text: '女生' }, { value: '0', text: '全本' }
        ],
        default: '1'
      }
    };
  }

  baseUrl() {
    return 'https://m.bi17.cc';
  }

  headers() {
    return {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/77.0.3865.120 Mobile Safari/537.36'
    };
  }

  // 中文站常见 GBK：解码成 UTF-8 会产生替换字符，检测到即明确报错而非返回乱码。
  guardEncoding(body) {
    if (body.indexOf('\uFFFD') >= 0) {
      throw new Error('站点返回非 UTF-8 编码（疑似 GBK），宿主当前仅支持 UTF-8');
    }
    return body;
  }

  async fetchOk(path) {
    const res = await Network.get(this.baseUrl() + path, this.headers());
    if (res.status === 429 || res.status === 503) throwRateLimited('笔趣阁访问受限：' + res.status);
    if (res.status === 404) throwNotFound('页面不存在：' + path);
    if (res.status !== 200) throw new Error('笔趣阁请求失败: ' + res.status);
    return this.guardEncoding(res.body);
  }

  parseList(jsonBody) {
    const arr = JSON.parse(jsonBody);
    if (!Array.isArray(arr)) return [];
    return arr.map(function (e) {
      return { id: e.url_list || e.url || '', title: e.articlename || '', cover: e.url_img || '', kind: 'novel' };
    }).filter(function (w) { return w.id; });
  }

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const kw = (keyword || '').trim();
      if (!kw) {
        const sortId = this.loadSetting('defaultCategory') || '1';
        const body = await this.fetchOk('/json?sortid=' + sortId + '&page=' + page);
        return { works: this.parseList(body), maxPage: page + 1 };
      }
      const body = await this.fetchOk('/user/search.html?q=' + encodeURIComponent(kw));
      return { works: this.parseList(body), maxPage: page + 1 };
    },
    page: async (keyword, options, pageOrNext) => {
      if (typeof pageOrNext === 'number') return await this.search.load(keyword, options, pageOrNext);
      return { works: [], maxPage: 1 };
    }
  };

  novel = {
    loadInfo: async (id) => {
      const body = await this.fetchOk(id);
      const title = Html.attr(body, 'meta[property="og:novel:book_name"]', 'content') || id;
      const cover = Html.attr(body, 'meta[property="og:image"]', 'content') || '';
      const desc = Html.attr(body, 'meta[property="og:description"]', 'content') || '';
      const listBody = await this.fetchOk(id + 'list.html');
      const chapters = Html.list(listBody, 'div.book_last > dl > dd', (el) => {
        const html = el.innerHtml;
        return { id: Html.attr(html, 'a', 'href') || '', title: Html.text(html, 'a').trim() };
      }).filter((c) => c.id && c.title);
      return { title: title, cover: cover, description: desc, chapters: chapters };
    },
    loadChapter: async (workId, chapterId) => {
      const MAX_PAGES = 50;
      let body = await this.fetchOk(chapterId);
      let text = this.extractPage(body);
      let next = Html.attr(body, 'a.Readpage_down', 'href') || '';
      let hops = 0;
      while (next && next.indexOf('_') >= 0 && hops < MAX_PAGES) {
        body = await this.fetchOk(next);
        text += '\n' + this.extractPage(body);
        next = Html.attr(body, 'a.Readpage_down', 'href') || '';
        hops += 1;
      }
      return { content: text.trim(), format: 'plain' };
    }
  };

  extractPage(body) {
    const raw = Html.text(body, 'div.Readarea.ReadAjax_content') || '';
    return raw
      .replace(/请收藏[^\n]*/g, '')
      .split('\n')
      .map(function (t) { return t.trim(); })
      .filter(function (t) { return t.length > 0; })
      .join('\n');
  }
}
