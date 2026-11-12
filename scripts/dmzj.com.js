// ==SourceScript==
// @name        动漫之家
// @key         dmzj.com
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        manga
// @domains     m.dmzj.com
// @capabilities search,comic,explore,settings,htmlHelper,imageLoad
// ==/SourceScript==

/**
 * Kurisa v4 源：动漫之家（服务端 HTML 站）。
 * 数据流改写自 MIT 许可的公开实现（仅沿用其站点接口：URL 形态与通用选择器；
 * 未复制原脚本；解析改用宿主 Html.* helper，自动 dispose）。
 * 反爬分类：429/503 → throwRateLimited；404 → throwNotFound。
 */
class Dmzj extends ComicSource {
  constructor() {
    super();
    this.name = '动漫之家';
    this.key = 'dmzj.com';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['manga'];
    this.domains = ['m.dmzj.com'];
    this.capabilities = ['search', 'comic', 'explore', 'settings', 'htmlHelper', 'imageLoad'];
    this.settings = {
      domains: {
        title: '选择域名',
        type: 'select',
        options: [{ value: 'https://m.dmzj.com', text: 'https://m.dmzj.com' }],
        default: 'https://m.dmzj.com'
      }
    };
  }

  baseUrl() {
    return this.loadSetting('domains') || 'https://m.dmzj.com';
  }

  headers() {
    return {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36',
      'Referer': this.baseUrl() + '/'
    };
  }

  fixUrl(u) {
    if (!u) return '';
    if (u.indexOf('http') === 0) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    const b = this.baseUrl().replace(/\/$/, '');
    return b + '/' + u.replace(/^\//, '');
  }

  parseComicCard(html) {
    const link = Html.text(html, 'a');
    const href = Html.attr(html, 'a', 'href') || '';
    const id = href.replace(/\/+$/, '').split('/').pop().replace(/\.html$/, '');
    const title = link || id;
    const cover = this.fixUrl(Html.attr(html, 'img', 'src'));
    if (!id || !title) return null;
    return { id: id, title: title, cover: cover };
  }

  async fetchOk(url) {
    const res = await Network.get(url, this.headers());
    if (res.status === 429 || res.status === 503) throwRateLimited('动漫之家访问受限：' + res.status);
    if (res.status === 404) throwNotFound('页面不存在：' + url);
    if (res.status !== 200) throw new Error('动漫之家请求失败: ' + res.status);
    return res.body;
  }

  explore = [{
    title: '动漫之家',
    type: 'multiPageComicList',
    load: async (page) => {
      const base = this.baseUrl();
      const body = await this.fetchOk(page === 1 ? base : base + '/page/' + page + '/');
      const items = Html.list(body, '.comic-list li, .book-list li, .comic-item, .list-item', (el) => {
        return this.parseComicCard(el.innerHtml);
      }).filter(Boolean);
      const result = {};
      if (items.length) result['推荐漫画'] = items;
      return result;
    }
  }];

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const body = await this.fetchOk(this.baseUrl() + '/search/' + encodeURIComponent(keyword) + '/' + page + '/');
      const items = Html.list(body, '.comic-list li, .book-list li, .comic-item, .list-item', (el) => {
        return this.parseComicCard(el.innerHtml);
      }).filter(Boolean);
      return { works: items.map((c) => ({ id: c.id, title: c.title, cover: c.cover, kind: 'manga' })), maxPage: page + 1 };
    },
    page: async (keyword, options, pageOrNext) => {
      if (typeof pageOrNext === 'number') {
        return await this.search.load(keyword, options, pageOrNext);
      }
      return { works: [], maxPage: 1 };
    }
  };

  comic = {
    loadInfo: async (id) => {
      const body = await this.fetchOk(this.baseUrl() + '/comic/' + id + '/');
      const title = Html.text(body, 'h1, .book-title, .detail-title') || id;
      const cover = this.fixUrl(Html.attr(body, '.book-cover img, .detail-cover img', 'src'));
      const chapters = Html.list(body, '#chapter-list a, .chapter-list a, .catalog a', (el, i) => {
        const href = el.attributes && el.attributes.href ? el.attributes.href : '';
        return { id: href.split('/').pop().replace('.html', ''), title: el.text.trim() };
      }).filter((c) => c.id && c.title);
      return { title: title, cover: cover, chapters: chapters };
    },
    loadEp: async (comicId, epId) => {
      const body = await this.fetchOk(this.baseUrl() + '/comic/' + comicId + '/' + epId + '.html');
      const urls = Html.list(body, '#chapter-images img, .chapter-content img, .read-content img', (el) => {
        const u = el.attributes && (el.attributes['data-src'] || el.attributes['data-original'] || el.attributes['src']);
        return this.fixUrl(u || '');
      }).filter(Boolean);
      return { images: urls };
    },
    onImageLoad: (url, comicId, epId) => ({
      url: url,
      headers: { 'Referer': 'https://m.dmzj.com/' }
    })
  };
}
