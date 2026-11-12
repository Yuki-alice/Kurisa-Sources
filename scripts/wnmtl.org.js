// ==SourceScript==
// @name        Wnmtl
// @key         wnmtl.org
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        novel
// @domains     api.mystorywave.com,wnmtl.com,www.wnmtl.com
// @capabilities search,novel,novelChapter,settings,htmlHelper
// ==/SourceScript==

/**
 * Kurisa v4 源：Wnmtl（英文小说 JSON API 站）。
 * 数据流改写自 MIT 许可的公开实现（仅沿用其站点接口：API 路径、字段名与分页语义；
 * 未复制原脚本；API 基地址改为声明式设置项，可由用户覆盖）。
 * 反爬分类：429/503 → throwRateLimited；404 → throwNotFound。
 */
class Wnmtl extends ComicSource {
  constructor() {
    super();
    this.name = 'Wnmtl';
    this.key = 'wnmtl.org';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['novel'];
    this.domains = ['api.mystorywave.com', 'wnmtl.com', 'www.wnmtl.com'];
    this.capabilities = ['search', 'novel', 'novelChapter', 'settings', 'htmlHelper'];
    this.settings = {
      apiBase: {
        title: 'API 地址',
        type: 'input',
        default: 'https://api.mystorywave.com/story-wave-backend/api/v1/content'
      }
    };
  }

  apiBase() {
    return this.loadSetting('apiBase') || 'https://api.mystorywave.com/story-wave-backend/api/v1/content';
  }

  async req(path) {
    const res = await Network.get(this.apiBase() + path, {});
    if (res.status === 429 || res.status === 503) throwRateLimited('Wnmtl 访问受限：' + res.status);
    if (res.status === 404) throwNotFound('内容不存在：' + path);
    if (res.status !== 200) throw new Error('Wnmtl 请求失败: ' + res.status);
    return JSON.parse(res.body);
  }

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const res = await this.req('/books/search?keyWord=' + encodeURIComponent(keyword) + '&pageNumber=' + page + '&pageSize=50');
      const list = (res.data && res.data.list) || [];
      return {
        works: list.map((item) => ({
          id: String(item.id),
          title: item.title || '',
          cover: item.coverImgUrl || '',
          kind: 'novel'
        })),
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
      const res = await this.req('/books/' + id);
      const chapters = await this.loadAllChapters(res.data.id);
      return {
        title: res.data.title,
        cover: res.data.coverImgUrl || '',
        description: res.data.synopsis || '',
        chapters: chapters
      };
    },
    loadChapter: async (workId, chapterId) => {
      const res = await this.req('/chapters/' + chapterId);
      // 接口返回 HTML 片段：剥标签转纯文本（保留段落换行）。
      const text = cleanNovelHtml(res.data.content || '');
      return { content: text, format: 'plain' };
    }
  };

  async loadAllChapters(bookId) {
    const chapters = [];
    const seen = {};
    let page = 1;
    while (chapters.length < 5000) {
      const res = await this.req(
        '/chapters/page?sortDirection=ASC&bookId=' + bookId + '&pageNumber=' + page + '&pageSize=1000'
      );
      const list = (res.data && res.data.list) || [];
      if (!list.length) break;
      let fresh = 0;
      for (let i = 0; i < list.length; i++) {
        const id = String(list[i].id);
        if (seen[id]) continue;
        seen[id] = 1;
        chapters.push({ id: id, title: list[i].title });
        fresh += 1;
      }
      // 站点忽略 pageNumber 时返回同一页：无新增即停，避免无界翻页。
      if (!fresh) break;
      page += 1;
    }
    return chapters;
  }
}
