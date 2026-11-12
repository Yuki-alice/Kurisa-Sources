// ==SourceScript==
// @name        好多漫画
// @key         haoduoman.com
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        manga
// @domains     www.haoduoman.com,m.haoduoman.com,img.haoduoman.com
// @capabilities search,comic,explore,category,settings,htmlHelper,imageLoad
// ==/SourceScript==

/**
 * Kurisa v4 源：好多漫画（服务端 HTML 站，多域名 + 真实分类）。
 * 数据流改写自 MIT 许可的公开实现（仅沿用其站点接口：URL 形态、选择器与分类参数；
 * 未复制原脚本；解析改用宿主 Html helper，自动 dispose；丢弃原稿中无实现的
 * crypto-js 占位分支，保留 DOM 回退这一真实路径）。
 * 反爬分类：429/503 → throwRateLimited；404 → throwNotFound。
 */
class Haoduoman extends ComicSource {
  constructor() {
    super();
    this.name = '好多漫画';
    this.key = 'haoduoman.com';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['manga'];
    this.domains = ['www.haoduoman.com', 'm.haoduoman.com', 'img.haoduoman.com'];
    this.capabilities = ['search', 'comic', 'explore', 'category', 'settings', 'htmlHelper', 'imageLoad'];
    this.settings = {
      domains: {
        title: '选择域名',
        type: 'select',
        options: [
          { value: 'https://www.haoduoman.com', text: 'www.haoduoman.com（PC 主站）' },
          { value: 'https://m.haoduoman.com', text: 'm.haoduoman.com（移动端）' }
        ],
        default: 'https://www.haoduoman.com'
      }
    };
  }

  baseUrl() {
    return this.loadSetting('domains') || 'https://www.haoduoman.com';
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
    const title = Html.text(html, '.name, .title, h3') || Html.text(html, 'a');
    const href = Html.attr(html, 'a', 'href') || '';
    const parts = href.split('/manhua/');
    const id = parts.length > 1 ? parts[1].split('/')[0] : href.split('/').pop();
    if (!id || !title) return null;
    const lazy = Html.attr(html, '.image.lazy', 'data-original');
    return {
      id: id,
      title: title,
      cover: this.fixUrl(lazy || Html.attr(html, 'img', 'src')),
      update: Html.text(html, '.chapter')
    };
  }

  async fetchOk(url) {
    const res = await Network.get(url, this.headers());
    if (res.status === 429 || res.status === 503) throwRateLimited('好多漫画访问受限：' + res.status);
    if (res.status === 404) throwNotFound('页面不存在：' + url);
    if (res.status !== 200) throw new Error('好多漫画请求失败: ' + res.status);
    return res.body;
  }

  explore = [{
    title: '好多漫画',
    type: 'multiPartPage',
    load: async (page) => {
      const body = page === 1
        ? await this.fetchOk(this.baseUrl())
        : await this.fetchOk(this.baseUrl() + '/page/' + page + '/');
      const result = {};
      const panels = Html.list(body, '.panel.is-white', (panel) => ({
        title: Html.text(panel.innerHtml, '.panel-heading h2') || '推荐',
        items: Html.list(panel.innerHtml, '.cell.comic-item', (el) => this.parseCard(el.innerHtml)).filter(Boolean)
      }));
      panels.forEach((p) => { if (p.items.length) result[p.title] = p.items; });
      return result;
    }
  }];

  category = {
    title: '好多漫画分类',
    parts: [
      {
        name: '地区',
        type: 'fixed',
        categories: ['国内', '日本', '韩国', '欧美'],
        categoryParams: ['guonei', 'riben', 'hanguo', 'oumei'],
        itemType: 'category'
      },
      {
        name: '题材',
        type: 'fixed',
        categories: [
          '热血', '仙侠', '玄幻', '都市', '冒险', '武侠', '格斗', '科幻', '异能', '重生',
          '推理', '悬疑', '竞技', '搞笑', '恐怖', '生活', '校园', '恋爱', '百合', '耽美'
        ],
        categoryParams: [
          'rexue', 'xianxia', 'xuanhuan', 'dushi', 'maoxian', 'wuxia', 'gedou', 'kehuan', 'yineng', 'chongsheng',
          'tuili', 'xuanyi', 'jingji', 'gaoxiao', 'kongbu', 'shenghuo', 'xiaoyuan', 'lianai', 'baihe', 'danmei'
        ],
        itemType: 'category'
      }
    ],
    enableRankingPage: false
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const body = await this.fetchOk(this.baseUrl() + '/manhua/area/' + param + '/' + page + '.html');
      const items = Html.list(body, '.cell.comic-item', (el) => this.parseCard(el.innerHtml)).filter(Boolean);
      return {
        works: items.map((c) => ({ id: c.id, title: c.title, cover: c.cover, kind: 'manga' })),
        maxPage: page + 1
      };
    }
  };

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const body = await this.fetchOk(this.baseUrl() + '/search?q=' + encodeURIComponent(keyword) + '&page=' + page);
      const items = Html.list(body, '.cell.comic-item, .search-result .comic-item', (el) => {
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
      const body = await this.fetchOk(this.baseUrl() + '/manhua/' + id);
      const chapters = Html.list(body, '.comic-chapters li a, .chapter-list a', (el) => {
        const href = el.attributes.href || '';
        return { id: href.split('/').pop().replace('.html', ''), title: el.text.trim() };
      }).filter((c) => c.id && c.title);
      return {
        title: Html.text(body, '.metas-title') || id,
        cover: this.fixUrl(Html.attr(body, '.metas-image img', 'src')),
        description: Html.text(body, '.metas-desc p'),
        chapters: chapters
      };
    },
    loadEp: async (comicId, epId) => {
      // 移动端优先（图片直链在 HTML 中）；404/空结果回退 PC 端，两端皆空才报 NotFound。
      const mobile = await this.tryEp('https://m.haoduoman.com/manhua/' + comicId + '/' + epId + '.html', false);
      if (mobile.length) return { images: mobile };
      const pc = await this.tryEp(this.baseUrl() + '/manhua/' + comicId + '/' + epId + '.html', true);
      if (!pc.length) throwNotFound('章节页无图片：' + comicId + '/' + epId);
      return { images: pc };
    },
    onImageLoad: (url, comicId, epId) => ({
      url: url,
      headers: { Referer: this.baseUrl() + '/' }
    })
  };

  async tryEp(url, strictNotFound) {
    const res = await Network.get(url, this.headers());
    if (res.status === 429 || res.status === 503) throwRateLimited('好多漫画访问受限：' + res.status);
    if (res.status === 404) {
      if (strictNotFound) throwNotFound('章节不存在：' + url);
      return [];
    }
    if (res.status !== 200) return [];
    const urls = Html.list(
      res.body,
      '.chapter-image img, .chapter-images img, .chapter-content img, .read-content img',
      (el) => {
        const u = el.attributes['data-src'] || el.attributes['data-original'] || el.attributes['src'] || '';
        return (u && u.indexOf('img.haoduoman.com') >= 0) ? this.fixUrl(u) : '';
      },
    ).filter(Boolean);
    return urls;
  }
}
