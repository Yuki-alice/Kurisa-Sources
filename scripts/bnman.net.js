// ==SourceScript==
// @name        百年漫画
// @key         bnman.net
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        manga
// @domains     m.bnman.net,www.bnman.net,cdn.bnman.net,img.bnman.net
// @capabilities search,comic,explore,category,settings,htmlHelper,imageLoad
// ==/SourceScript==

/**
 * Kurisa v4 源：百年漫画（服务端 HTML，多域名 + 真实分类）。
 * 数据流改写自 MIT 许可的公开实现（仅沿用其站点接口：URL 形态、选择器与分类参数；
 * 未复制原脚本）。
 * 修复（相对原稿）：
 * - 原稿把章节 id 记为数组下标、丢弃 href，再拼 `/read/{comicId}_{下标}.html`，
 *   站点章节号与下标不一致时会取错章；此处**优先从 href 解出真实章节号**，仅在解析不到时回退下标。
 * - 章节图以页面内 `cp = [...]` 数据字面量提取（JSON 解析，非执行代码）；再回退 DOM 懒加载。
 * 反爬分类：429/503 → throwRateLimited；404 → throwNotFound。
 */
class BainianMh extends ComicSource {
  constructor() {
    super();
    this.name = '百年漫画';
    this.key = 'bnman.net';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['manga'];
    this.domains = ['m.bnman.net', 'www.bnman.net', 'cdn.bnman.net', 'img.bnman.net'];
    this.capabilities = ['search', 'comic', 'explore', 'category', 'settings', 'htmlHelper', 'imageLoad'];
    this.settings = {
      domains: {
        title: '选择域名',
        type: 'select',
        options: [
          { value: 'https://m.bnman.net', text: 'm.bnman.net（移动端）' },
          { value: 'https://www.bnman.net', text: 'www.bnman.net（PC 端）' }
        ],
        default: 'https://m.bnman.net'
      }
    };
  }

  baseUrl() {
    return this.loadSetting('domains') || 'https://m.bnman.net';
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
    const title = (Html.text(html, 'a') || Html.text(html, '.title, h3, h4')).trim();
    if (!href || !title) return null;
    return {
      id: href.replace(this.baseUrl(), '').replace(/^\//, ''),
      title: title,
      cover: this.fixUrl(Html.attr(html, 'img', 'data-src') || Html.attr(html, 'img', 'src')),
      update: Html.text(html, '.subtitle, .update')
    };
  }

  async fetchOk(url) {
    const res = await Network.get(url, this.headers());
    if (res.status === 429 || res.status === 503) throwRateLimited('百年漫画访问受限：' + res.status);
    if (res.status === 404) throwNotFound('页面不存在：' + url);
    if (res.status !== 200) throw new Error('百年漫画请求失败: ' + res.status);
    return res.body;
  }

  explore = [{
    title: '百年漫画',
    type: 'multiPartPage',
    load: async () => {
      const body = await this.fetchOk(this.baseUrl());
      const result = {};
      const lists = Html.list(body, 'div.tbox_m, .recommend-list, .comic-list', (panel) => {
        const title = Html.text(panel.innerHtml, 'h3, h2, .title, .more') || '推荐';
        const items = Html.list(panel.innerHtml, 'li', (el) => this.parseCard(el.innerHtml)).filter(Boolean);
        return { title: title, items: items };
      });
      lists.forEach((p, i) => {
        if (p.items.length) result[p.title || ('推荐' + (i + 1))] = p.items;
      });
      if (!Object.keys(result).length) {
        const items = Html.list(body, 'ul.tbox_m > li, .comic_list li, .list li', (el) => {
          return this.parseCard(el.innerHtml);
        }).filter(Boolean);
        if (items.length) result['推荐'] = items;
      }
      return result;
    }
  }];

  category = {
    title: '百年漫画分类',
    parts: [{
      name: '全部',
      type: 'fixed',
      categories: ['热门', '最新', '完结'],
      categoryParams: ['hot', 'new', 'complete'],
      itemType: 'category'
    }],
    enableRankingPage: false
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      let path;
      if (param === 'hot') path = '/top/';
      else if (param === 'new') path = '/update/';
      else if (param === 'complete') path = '/complete/';
      else path = '/';
      const body = await this.fetchOk(this.baseUrl() + path);
      const items = Html.list(body, 'ul.tbox_m > li, .list li, div.comic_list li', (el) => {
        return this.parseCard(el.innerHtml);
      }).filter(Boolean);
      return {
        works: items.map((c) => ({ id: c.id, title: c.title, cover: c.cover, kind: 'manga' })),
        maxPage: 1
      };
    }
  };

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const body = await this.fetchOk(
        this.baseUrl() + '/search/' + encodeURIComponent(keyword) + '/' + page + '.html'
      );
      const items = Html.list(body, 'ul.tbox_m > li', (el) => this.parseCard(el.innerHtml)).filter(Boolean);
      return {
        works: items.map((c) => ({ id: c.id, title: c.title, cover: c.cover, kind: 'manga' })),
        maxPage: items.length ? page + 1 : page
      };
    },
    page: async (keyword, options, pageOrNext) => {
      if (typeof pageOrNext === 'number') return await this.search.load(keyword, options, pageOrNext);
      return { works: [], maxPage: 1 };
    }
  };

  // 从章节链接解真实章节号；兼容 `/read/<cid>_<epid>.html`、`<cid>_<epid>` 与纯数字尾段。
  chapterIdOf(href) {
    let h = (href || '').replace(/\/+$/, '').replace(/\.html$/, '');
    const seg = h.split('/').pop() || '';
    const us = seg.lastIndexOf('_');
    if (us >= 0 && us < seg.length - 1) return seg.substring(us + 1);
    return seg;
  }

  comic = {
    loadInfo: async (id) => {
      let body;
      try {
        body = await this.fetchOk(this.baseUrl() + '/' + id);
      } catch (e) {
        body = await this.fetchOk(this.baseUrl() + '/comic/' + id + '.html');
      }
      let chapters = [];
      const selectors = [
        'div.tabs_block > ul.list_block > li > a',
        'ul.catalog-list > li > a',
        'div.book-detail > ul > li > a',
        '#chapter-list li a'
      ];
      for (let s = 0; s < selectors.length; s++) {
        const items = Html.list(body, selectors[s], (el, idx) => {
          const title = el.text.trim();
          if (!title) return null;
          const href = el.attributes && el.attributes.href ? el.attributes.href : '';
          const fromHref = this.chapterIdOf(href);
          return { id: fromHref || String(idx), title: title };
        }).filter(Boolean);
        if (items.length) { chapters = items; break; }
      }
      const coverEl = Html.list(body, 'div.dbox > div.img > mip-img, .book-cover img, img.cover', (el) => {
        return el.attributes['src'] || el.attributes['data-src'] || '';
      });
      return {
        title: Html.text(body, 'div.dbox > div.data > h4, h1, .book-title h1') || id,
        cover: this.fixUrl(coverEl.length ? coverEl[0] : ''),
        description: Html.text(body, 'div.tbox_js, .book-intro, .intro'),
        chapters: chapters
      };
    },
    loadEp: async (comicId, epId) => {
      let body;
      try {
        body = await this.fetchOk(this.baseUrl() + '/read/' + comicId + '_' + epId + '.html');
      } catch (e) {
        body = await this.fetchOk(this.baseUrl() + '/' + comicId + '_' + epId);
      }
      const images = [];
      // 页面内 `cp = [...]` 数据字面量（JSON 解析，不执行代码）。
      const marker = 'cp = ';
      const at = body.indexOf(marker);
      if (at >= 0) {
        const start = body.indexOf('[', at);
        const end = start >= 0 ? body.indexOf(']', start) : -1;
        if (start >= 0 && end > start) {
          const literal = body.substring(start, end + 1).replace(/'/g, '"');
          try {
            const arr = JSON.parse(literal);
            for (let i = 0; i < arr.length; i++) {
              let s = String(arr[i]);
              if (s.charAt(0) === '/') s = this.fixUrl(s);
              images.push(s);
            }
          } catch (e) { /* 回退 DOM */ }
        }
      }
      if (!images.length) {
        const dom = Html.list(body, '.read-content img, #cp_img img, .chapter-content img', (el) => {
          const u = el.attributes['data-src'] || el.attributes['src'] || '';
          return this.fixUrl(u);
        }).filter(Boolean);
        for (let i = 0; i < dom.length; i++) images.push(dom[i]);
      }
      return { images: images };
    },
    onImageLoad: (url, comicId, epId) => ({
      url: url,
      headers: { Referer: this.baseUrl() + '/' }
    })
  };
}
