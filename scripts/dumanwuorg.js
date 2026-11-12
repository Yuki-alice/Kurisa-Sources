// ==SourceScript==
// @name        读漫屋
// @key         dumanwuorg
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        manga
// @domains     www.dumanwu.org
// @capabilities search,comic,explore,settings,htmlHelper,imageLoad
// ==/SourceScript==

/**
 * Kurisa v4 源：读漫屋（服务端 HTML 站）。
 * 数据流改写自 MIT 许可的公开实现（仅沿用其站点接口形状：URL 形态与通用选择器；
 * 未复制原脚本；解析改用宿主 Html helper，自动 dispose）。
 * 反爬分类：429/503 → throwRateLimited；404 → throwNotFound。
 */
class Dumanwuorg extends ComicSource {
  constructor() {
    super();
    this.name = '读漫屋';
    this.key = 'dumanwuorg';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['manga'];
    this.domains = ['www.dumanwu.org'];
    this.capabilities = ['search', 'comic', 'explore', 'settings', 'htmlHelper', 'imageLoad'];
    this.settings = {
      domains: {
        title: '选择域名',
        type: 'select',
        options: [{ value: 'https://www.dumanwu.org', text: 'https://www.dumanwu.org' }],
        default: 'https://www.dumanwu.org'
      }
    };
  }

  baseUrl() {
    return this.loadSetting('domains') || 'https://www.dumanwu.org';
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
    return this.baseUrl().replace(/\/$/, '') + '/' + u.replace(/^\//, '');
  }

  parseCard(html) {
    const title = Html.text(html, '.title, h3, h4, .book-title') || Html.text(html, 'a');
    const href = Html.attr(html, 'a', 'href') || '';
    const id = href.replace(/\/+$/, '').split('/').pop().replace(/\.html$/, '');
    if (!id || !title) return null;
    return {
      id: id,
      title: title,
      cover: this.fixUrl(Html.attr(html, 'img', 'src')),
      update: Html.text(html, '.update, .chapter')
    };
  }

  async fetchOk(url) {
    const res = await Network.get(url, this.headers());
    if (res.status === 429 || res.status === 503) throwRateLimited('读漫屋访问受限：' + res.status);
    if (res.status === 404) throwNotFound('页面不存在：' + url);
    if (res.status !== 200) throw new Error('读漫屋请求失败: ' + res.status);
    return res.body;
  }

  explore = [{
    title: '读漫屋',
    type: 'multiPageComicList',
    load: async (page) => {
      const body = await this.fetchOk(page === 1 ? this.baseUrl() : this.baseUrl() + '/page/' + page + '/');
      const items = Html.list(body, '.comic-list li, .book-list li, .comic-item, .list-item', (el) => {
        return this.parseCard(el.innerHtml);
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
        return this.parseCard(el.innerHtml);
      }).filter(Boolean);
      return {
        works: items.map((c) => ({ id: c.id, title: c.title, cover: c.cover, kind: 'manga' })),
        maxPage: page + 1
      };
    },
    page: async (keyword, options, pageOrNext) => {
      if (typeof pageOrNext === 'number') return await this.search.load(keyword, options, pageOrNext);
      return { works: [], maxPage: 1 };
    }
  };

  comic = {
    loadInfo: async (id) => {
      const body = await this.fetchOk(this.baseUrl() + '/comic/' + id + '/');
      const chapters = Html.list(body, '#chapter-list a, .chapter-list a, .catalog a', (el) => {
        const href = el.attributes.href || '';
        return { id: href.split('/').pop().replace('.html', ''), title: el.text.trim() };
      }).filter((c) => c.id && c.title);
      return {
        title: Html.text(body, 'h1, .book-title, .detail-title') || id,
        cover: this.fixUrl(Html.attr(body, '.book-cover img, .detail-cover img', 'src')),
        description: Html.text(body, '.book-intro, .intro, .description'),
        chapters: chapters
      };
    },
    loadEp: async (comicId, epId) => {
      const body = await this.fetchOk(this.baseUrl() + '/comic/' + comicId + '/' + epId + '.html');
      const urls = Html.list(body, '#chapter-images img, .chapter-content img, .read-content img', (el) => {
        const u = el.attributes['data-src'] || el.attributes['data-original'] || el.attributes['src'] || '';
        return this.fixUrl(u);
      }).filter(Boolean);
      return { images: urls };
    },
    onImageLoad: (url, comicId, epId) => ({
      url: url,
      headers: { 'Referer': 'https://www.dumanwu.org/' }
    })
  };
}
