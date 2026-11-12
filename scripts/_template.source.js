// ==SourceScript==
// @name        Template Source (rename me)
// @key         template.source
// @version     0.1.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        manga
// @domains     example.invalid
// @capabilities search,comic,novelChapter,settings,htmlHelper
// ==/SourceScript==

/**
 * Kurisa v4 统一源模板（单一入口，漫画/小说二选一：删掉不需要的命名空间即可）。
 * 约束（违反会在 strictV4 下抛 CONTRACT）：
 * - init 只做 KV 预热，禁止网络副作用；跨调用状态一律走 loadData/saveData；
 * - 解析一律用 Html.list/text/attr（自动 dispose），禁止 new HtmlDocument；
 * - 429/503 → throwRateLimited，404 → throwNotFound；未知错误直接 throw 字符串。
 * 不含任何真实站点（C1）。复制后改 key/name/domains + 三段选择器即可跑。
 */
class TemplateSource extends ComicSource {
  constructor() {
    super();
    this.key = 'template.source';
    this.name = 'Template Source';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['manga']; // 小说源改为 ['novel']，并删掉 comic 段、保留 novel 段
    this.domains = ['example.invalid'];
    this.capabilities = ['search', 'comic', 'novelChapter', 'settings', 'htmlHelper'];
  }

  baseUrl() {
    return this.loadSetting('baseUrl') || 'https://example.invalid';
  }

  async fetchOk(url) {
    const res = await Network.get(url, {});
    if (res.status === 429 || res.status === 503) throwRateLimited('访问受限：' + res.status);
    if (res.status === 404) throwNotFound('页面不存在：' + url);
    if (res.status !== 200) throw new Error('请求失败: ' + res.status);
    return res.body;
  }

  // TODO(1/3): 搜索列表——填 list 选择器与字段映射（id/title 必填，cover 可空）。
  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const body = await this.fetchOk(
        this.baseUrl() + '/search?q=' + encodeURIComponent(keyword) + '&page=' + page
      );
      const works = Html.list(body, '.item', (el) => {
        const html = el.innerHtml;
        const href = Html.attr(html, 'a', 'href') || '';
        return {
          // TODO: 按站点改 id 提取（fileName 取末段去扩展名仅为示例）。
          id: href.replace(/\/+$/, '').split('/').pop(),
          title: Html.text(html, 'a'),
          cover: Html.attr(html, 'img', 'src'),
          kind: 'manga',
        };
      }).filter((w) => w.id && w.title);
      return { works: works, maxPage: page + 1 };
    },
    page: async (keyword, options, pageOrNext) => {
      if (typeof pageOrNext === 'number') return await this.search.load(keyword, options, pageOrNext);
      return { works: [], maxPage: 1 };
    }
  };

  // TODO(2/3): 漫画详情+目录——删掉整段即为纯小说源（同步删 capabilities 里的 comic，留 novel）。
  comic = {
    loadInfo: async (id) => {
      const body = await this.fetchOk(this.baseUrl() + '/comic/' + id + '/');
      const chapters = Html.list(body, '.chapter-list a', (el) => ({
        // TODO: 按站点改 id 提取。
        id: (el.attributes.href || '').split('/').pop(),
        title: el.text.trim(),
      })).filter((c) => c.id && c.title);
      return {
        title: Html.text(body, 'h1') || id,
        cover: Html.attr(body, '.cover img', 'src'),
        description: Html.text(body, '.intro'),
        chapters: chapters,
      };
    },
    loadEp: async (comicId, epId) => {
      const body = await this.fetchOk(this.baseUrl() + '/comic/' + comicId + '/' + epId + '.html');
      const urls = Html.list(body, '.page img', (el) => (
        el.attributes['data-src'] || el.attributes['data-original'] || el.attributes['src'] || ''
      )).filter(Boolean);
      return { images: urls };
    },
    onImageLoad: (url) => ({ url: url, headers: {} }),
  };

  // TODO(3/3): 小说目录+正文——删掉整段即为纯漫画源（同步删 capabilities 里的 novel/novelChapter）。
  // 章节跨页（上一页/下一页链接）必须在宿主侧有界循环内收敛，禁止 while(true)。
  novel = {
    loadInfo: async (id) => {
      const body = await this.fetchOk(this.baseUrl() + '/book/' + id + '/');
      const chapters = Html.list(body, '.chapter-list a', (el) => ({
        id: (el.attributes.href || '').split('/').pop(),
        title: el.text.trim(),
      })).filter((c) => c.id && c.title);
      return {
        title: Html.text(body, 'h1') || id,
        chapters: chapters,
      };
    },
    loadChapter: async (workId, chapterId) => {
      const body = await this.fetchOk(this.baseUrl() + '/book/' + workId + '/' + chapterId + '.html');
      // TODO: 先用选择器锁定正文容器；html 片段进清洗通道，纯文本填 plain；文内图走 onImageResolve（v4）。
      const cleaned = cleanNovelHtml(Html.text(body, '#content') || '');
      return { content: cleaned, format: 'plain' };
    },
  };
}
