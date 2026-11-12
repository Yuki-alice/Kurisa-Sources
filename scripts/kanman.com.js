// ==SourceScript==
// @name        看漫画
// @key         kanman.com
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        manga
// @domains     www.kanman.com,m.kanman.com
// @capabilities search,comic,explore,category,settings,htmlHelper,imageLoad
// ==/SourceScript==

/**
 * Kurisa v4 源：看漫画（服务端 HTML，含题材分类）。
 * 数据流改写自 MIT 许可的公开实现（仅沿用其站点接口：URL 形态、选择器与分类参数；
 * 未复制原脚本；解析改用宿主 Html helper，自动 dispose）。
 * 反爬分类：429/503 → throwRateLimited；404 → throwNotFound。
 */
class Kanman extends ComicSource {
  constructor() {
    super();
    this.name = '看漫画';
    this.key = 'kanman.com';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['manga'];
    this.domains = ['www.kanman.com', 'm.kanman.com'];
    this.capabilities = ['search', 'comic', 'explore', 'category', 'settings', 'htmlHelper', 'imageLoad'];
    this.settings = {
      domains: {
        title: '选择域名',
        type: 'select',
        options: [
          { value: 'https://www.kanman.com', text: 'kanman.com（主站）' },
          { value: 'https://m.kanman.com', text: 'm.kanman.com（移动端）' }
        ],
        default: 'https://www.kanman.com'
      }
    };
  }

  baseUrl() {
    return this.loadSetting('domains') || 'https://www.kanman.com';
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
    const href = Html.attr(html, 'a', 'href') || '';
    const title = (Html.text(html, '.book-title, .book-main-title, .title, h3') || Html.text(html, 'a')).trim();
    if (!href || !title) return null;
    return {
      id: href.split('/').filter(Boolean).pop().replace('.html', ''),
      title: title,
      cover: this.fixUrl(Html.attr(html, '.book-cover img, .book-main-cover img', 'src') || Html.attr(html, 'img', 'src')),
      update: Html.text(html, '.update, .chapter, .latest')
    };
  }

  async fetchOk(url) {
    const res = await Network.get(url, this.headers());
    if (res.status === 429 || res.status === 503) throwRateLimited('看漫画访问受限：' + res.status);
    if (res.status === 404) throwNotFound('页面不存在：' + url);
    if (res.status !== 200) throw new Error('看漫画请求失败: ' + res.status);
    return res.body;
  }

  explore = [{
    title: '看漫画',
    type: 'multiPageComicList',
    load: async (page) => {
      const body = await this.fetchOk(page === 1 ? this.baseUrl() : this.baseUrl() + '/page/' + page + '/');
      const items = Html.list(body, '.book, .block-item, .book-list li', (el) => this.parseCard(el.innerHtml)).filter(Boolean);
      const result = {};
      if (items.length) result['推荐'] = items;
      return result;
    }
  }];

  category = {
    title: '看漫画分类',
    parts: [{
      name: '题材',
      type: 'fixed',
      categories: ['热血', '魔幻', '冒险', '格斗', '科幻', '机战', '悬疑', '推理', '校园', '恋爱', '搞笑', '生活', '其他'],
      categoryParams: ['rexue', 'mohuan', 'maoxian', 'gedou', 'kehuan', 'jizhan', 'xuanyi', 'tuili', 'xiaoyuan', 'lianai', 'gaoxiao', 'shenghuo', 'qita'],
      itemType: 'category'
    }],
    enableRankingPage: false
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const body = await this.fetchOk(this.baseUrl() + '/list/' + param + '/' + page + '.html');
      const items = Html.list(body, '.book, .block-item, .book-list li', (el) => this.parseCard(el.innerHtml)).filter(Boolean);
      return {
        works: items.map((c) => ({ id: c.id, title: c.title, cover: c.cover, kind: 'manga' })),
        maxPage: page + 1
      };
    }
  };

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const body = await this.fetchOk(
        this.baseUrl() + '/search/' + encodeURIComponent(keyword) + '/' + page + '.html'
      );
      const items = Html.list(body, '.book, .block-item, .book-list li', (el) => this.parseCard(el.innerHtml)).filter(Boolean);
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
      const chapters = Html.list(body, '#chapter-list a, .chapter-list a, .catalog a, .detail-list-1 a', (el) => {
        const href = el.attributes && el.attributes.href ? el.attributes.href : '';
        const title = el.text.trim();
        if (!href || !title) return null;
        return { id: href.split('/').pop().replace('.html', ''), title: title };
      }).filter(Boolean);
      return {
        title: Html.text(body, '.book-title, .book-main-title, h1, .detail-title') || id,
        cover: this.fixUrl(Html.attr(body, '.book-cover img, .book-main-cover img, .detail-cover img', 'src')),
        description: Html.text(body, '.book-intro, .intro, .description'),
        chapters: chapters
      };
    },
    loadEp: async (comicId, epId) => {
      const body = await this.fetchOk(this.baseUrl() + '/comic/' + comicId + '/' + epId + '.html');
      const urls = Html.list(
        body,
        '.chapter-images img, .chapter-content img, .read-content img, .book-read img',
        (el) => {
          const u = el.attributes['data-src'] || el.attributes['data-original'] || el.attributes['src'] || '';
          return this.fixUrl(u);
        }
      ).filter(Boolean);
      return { images: urls };
    },
    onImageLoad: (url, comicId, epId) => ({
      url: url,
      headers: { Referer: this.baseUrl() + '/' }
    })
  };
}
