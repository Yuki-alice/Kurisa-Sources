// ==SourceScript==
// @name        免费小说网
// @key         mfxs.www493d
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        novel
// @domains     www.493d.com
// @capabilities search,novel,novelChapter,explore,htmlHelper
// ==/SourceScript==

/**
 * Kurisa v4 源：免费小说网（中文小说，服务端 HTML）。
 * 数据流改写自 MIT 许可的公开实现（仅沿用其站点接口：路径与列表/目录结构；
 * 未复制原脚本；解析改用宿主 Html helper，自动 dispose）。
 * 差异：原稿对每个字段直接 `match(...)[1]`（失配即抛 TypeError），
 * 此处逐字段判空跳过，单条异常不毁整页。
 * 反爬分类：429/503 → throwRateLimited；404 → throwNotFound。
 */
class Mfxs extends ComicSource {
  constructor() {
    super();
    this.name = '免费小说网';
    this.key = 'mfxs.www493d';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['novel'];
    this.domains = ['www.493d.com'];
    this.capabilities = ['search', 'novel', 'novelChapter', 'explore', 'htmlHelper'];
  }

  baseUrl() {
    return 'https://www.493d.com';
  }

  headers() {
    return {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36',
      'Referer': this.baseUrl() + '/'
    };
  }

  guardEncoding(body) {
    if (body.indexOf('\uFFFD') >= 0) {
      throw new Error('站点返回非 UTF-8 编码（疑似 GBK），宿主当前仅支持 UTF-8');
    }
    return body;
  }

  async fetchOk(path) {
    const res = await Network.get(this.baseUrl() + path, this.headers());
    if (res.status === 429 || res.status === 503) throwRateLimited('免费小说网访问受限：' + res.status);
    if (res.status === 404) throwNotFound('页面不存在：' + path);
    if (res.status !== 200) throw new Error('免费小说网请求失败: ' + res.status);
    return this.guardEncoding(res.body);
  }

  absUrl(href) {
    if (!href) return '';
    if (href.indexOf('http') === 0) return href;
    return this.baseUrl() + (href.indexOf('/') === 0 ? href : '/' + href);
  }

  explore = [{
    title: '免费小说网',
    type: 'multiPageComicList',
    load: async (page) => {
      const body = await this.fetchOk('/top_allvipvote/' + page + '.html');
      const items = Html.list(body, 'li.g_col_6', (el) => {
        const html = el.innerHtml;
        const href = Html.attr(html, 'a', 'href');
        const title = Html.attr(html, 'a', 'title');
        if (!href || !title) return null;
        return {
          id: this.absUrl(href),
          title: title,
          cover: this.absUrl(Html.attr(html, 'img', 'src'))
        };
      }).filter(Boolean);
      const result = {};
      if (items.length) result['榜单'] = items.map((w) => ({ ...w, kind: 'novel' }));
      return result;
    }
  }];

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const body = await this.fetchOk(
        '/modules/article/search.php?searchkey=' + encodeURIComponent(keyword) +
        '&searchtype=articlename&page=' + page
      );
      const items = Html.list(body, 'li.pr.pb20.mb20', (el) => {
        const html = el.innerHtml;
        const href = Html.attr(html, 'a', 'href');
        const title = Html.attr(html, '.c_strong', 'title') || Html.text(html, '.c_strong');
        if (!href || !title) return null;
        return {
          id: this.absUrl(href),
          title: title,
          cover: this.absUrl(Html.attr(html, 'img', 'src'))
        };
      }).filter(Boolean);
      return {
        works: items.map((w) => ({ ...w, kind: 'novel' })),
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
      const url = id.indexOf('http') === 0 ? id : this.absUrl(id);
      const path = url.replace(this.baseUrl(), '');
      const body = await this.fetchOk(path);
      const chapters = Html.list(body, 'li.w33p', (el) => {
        const html = el.innerHtml;
        const href = Html.attr(html, 'a', 'href');
        const name = Html.text(html, 'a').trim();
        if (!href || !name) return null;
        return { id: this.absUrl(href), title: name };
      }).filter(Boolean);
      return {
        title: Html.attr(body, 'meta[property="og:title"]', 'content') || id,
        cover: this.absUrl(Html.attr(body, 'meta[property="og:image"]', 'content')),
        description: Html.attr(body, 'meta[property="og:description"]', 'content') || '',
        chapters: chapters
      };
    },
    loadChapter: async (workId, chapterId) => {
      const url = chapterId.indexOf('http') === 0 ? chapterId : this.absUrl(chapterId);
      const body = await this.fetchOk(url.replace(this.baseUrl(), ''));
      const title = Html.text(body, 'h1').trim();
      // 正文按段首全角缩进切段（站点以 &emsp;&emsp; 起始每段）。
      const raw = Html.text(body, '.content, #content, .Readarea');
      const paras = raw
        .split('\n')
        .map(function (t) { return t.replace(/^\u3000+/, '').trim(); })
        .filter(function (t) { return t.length > 0; });
      return {
        content: title && !paras.length ? '' : paras.join('\n'),
        format: 'plain'
      };
    }
  };
}
