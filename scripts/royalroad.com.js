// ==SourceScript==
// @name        RoyalRoad
// @key         royalroad.com
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        novel
// @domains     royalroad.com,www.royalroad.com
// @capabilities search,novel,novelChapter,htmlHelper
// ==/SourceScript==

/**
 * Kurisa v4 源：RoyalRoad（英文小说站，服务端 HTML）。
 * 数据流改写自 MIT 许可的公开实现（仅沿用其站点接口：URL 形态与通用选择器；
 * 方法体按 Kurisa v4 API（Network/Html helper）重写，未复制原脚本）。
 * 反爬分类：429/503 → throwRateLimited；404 → throwNotFound。
 */
class RoyalRoad extends ComicSource {
  constructor() {
    super();
    this.name = 'RoyalRoad';
    this.key = 'royalroad.com';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['novel'];
    this.domains = ['royalroad.com', 'www.royalroad.com'];
    this.capabilities = ['search', 'novel', 'novelChapter', 'htmlHelper'];
  }

  baseUrl() {
    return 'https://www.royalroad.com';
  }

  async fetchOk(path) {
    const res = await Network.get(this.baseUrl() + path, {});
    if (res.status === 429 || res.status === 503) throwRateLimited('RoyalRoad 访问受限：' + res.status);
    if (res.status === 404) throwNotFound('页面不存在：' + path);
    if (res.status !== 200) throw new Error('RoyalRoad 请求失败: ' + res.status);
    return res.body;
  }

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const body = await this.fetchOk('/fictions/search?page=' + page + '&title=' + encodeURIComponent(keyword));
      const works = Html.list(body, '.fiction-list-item', (el) => {
        const html = el.innerHtml;
        const url = Html.attr(html, '.fiction-title a', 'href') || '';
        return {
          id: url,
          title: Html.text(html, '.fiction-title a') || url,
          cover: Html.attr(html, 'img', 'src') || '',
          kind: 'novel'
        };
      }).filter((w) => w.id);
      return { works: works, maxPage: 1 };
    },
    page: async (keyword, options, pageOrNext) => {
      if (typeof pageOrNext === 'number') {
        return await this.search.load(keyword, options, pageOrNext);
      }
      return { works: [], maxPage: 1 };
    }
  };

  novel = {
    loadInfo: async (id) => {
      const body = await this.fetchOk(id);
      const chapters = Html.list(body, '#chapters .chapter-row', (el) => {
        const html = el.innerHtml;
        const url = Html.attr(html, 'a', 'href') || '';
        const name = Html.text(html, 'a').trim();
        return { id: url, title: name || url };
      }).filter((c) => c.id);
      return {
        title: Html.text(body, 'h1') || id,
        cover: Html.attr(body, '.cover-image-container img', 'src') || '',
        description: Html.text(body, '.description .hidden-content').trim(),
        chapters: chapters
      };
    },
    loadChapter: async (workId, chapterId) => {
      const body = await this.fetchOk(chapterId);
      const paras = Html.list(body, '.chapter-content p', (el) => el.text.trim())
        .filter(function (t) { return t.length > 0; });
      const content = paras.length ? paras.join('\n\n') : Html.text(body, '.chapter-content');
      return { content: content, format: 'plain' };
    }
  };
}
