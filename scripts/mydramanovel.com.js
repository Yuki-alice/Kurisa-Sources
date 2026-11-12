// ==SourceScript==
// @name        MyDramaNovel
// @key         mydramanovel.com
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        novel
// @domains     mydramanovel.com,www.mydramanovel.com
// @capabilities search,novel,novelChapter,htmlHelper,explore
// ==/SourceScript==

/**
 * Kurisa v4 源：MyDramaNovel（英文小说站，服务端 HTML）。
 * 数据流改写自 MIT 许可的公开实现（仅沿用其站点接口：路径、选择器与章节识别规则；
 * 未复制原脚本）。
 * 差异：原稿遇 Cloudflare 挑战会 `openWebView` 过盾——Kurisa 该能力属 M6 未落地，
 * 此处改为 `throwRateLimited` 明确失败，不静默返回空。
 * 反爬分类：CF 挑战/429/503 → throwRateLimited；404 → throwNotFound。
 */
class MyDramaNovel extends ComicSource {
  constructor() {
    super();
    this.name = 'MyDramaNovel';
    this.key = 'mydramanovel.com';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['novel'];
    this.domains = ['mydramanovel.com', 'www.mydramanovel.com'];
    this.capabilities = ['search', 'novel', 'novelChapter', 'htmlHelper', 'explore'];
  }

  baseUrl() {
    return 'https://mydramanovel.com';
  }

  headers() {
    return { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0' };
  }

  async fetchOk(path) {
    const res = await Network.get(this.baseUrl() + path, this.headers());
    if (res.status === 429 || res.status === 503) throwRateLimited('MyDramaNovel 访问受限：' + res.status);
    if (res.status === 404) throwNotFound('页面不存在：' + path);
    if (res.status !== 200) throw new Error('MyDramaNovel 请求失败: ' + res.status);
    const body = res.body;
    // Cloudflare 挑战页：无 WebView 过盾能力，明确报限流而不是当成空列表。
    if (body.indexOf('Just a moment...') >= 0 || body.indexOf('cf-mitigation') >= 0 ||
        body.indexOf('Attention Required! | Cloudflare') >= 0 ||
        body.indexOf('Enable JavaScript and cookies to continue') >= 0) {
      throwRateLimited('MyDramaNovel 触发 Cloudflare 挑战（需 M6 WebView 过盾）');
    }
    return body;
  }

  async fetchNovels() {
    const body = await this.fetchOk('/novels/');
    return Html.list(body, 'a.td-ct-item', (el) => {
      // 列表项本身就是 <a>：href 取其自身属性，标题再向内查。
      const href = el.attributes && el.attributes.href ? el.attributes.href : '';
      return {
        id: href,
        title: Html.text(el.innerHtml, '.td-ct-item-name').trim(),
        cover: ''
      };
    }).filter((w) => w.id && w.title);
  }

  explore = [{
    title: 'MyDramaNovel',
    type: 'multiPageComicList',
    load: async (page) => {
      // 站点只有单页书单：第 2 页起返回空，避免无限翻页。
      const list = page === 1 ? await this.fetchNovels() : [];
      const result = {};
      if (list.length) result['全部小说'] = list.map((w) => ({ ...w, kind: 'novel' }));
      return result;
    }
  }];

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      // 站点无搜索接口：对书单做本地过滤（原稿同策略）。
      if (page > 1) return { works: [], maxPage: 1 };
      const novels = await this.fetchNovels();
      const kw = (keyword || '').toLowerCase();
      const works = novels
        .filter((w) => w.title.toLowerCase().indexOf(kw) >= 0 || w.id.toLowerCase().indexOf(kw) >= 0)
        .map((w) => ({ id: w.id, title: w.title, cover: w.cover, kind: 'novel' }));
      return { works: works, maxPage: 1 };
    },
    page: async (keyword, options, pageOrNext) => {
      if (typeof pageOrNext === 'number') return await this.search.load(keyword, options, pageOrNext);
      return { works: [], maxPage: 1 };
    }
  };

  novel = {
    loadInfo: async (id) => {
      const body = await this.fetchOk(id);
      const slug = id.replace('https://mydramanovel.com', '').replace(/^\/+|\/+$/g, '');
      const chapters = Html.list(body, 'a', (el) => {
        const href = el.attributes && el.attributes.href ? el.attributes.href : '';
        const name = el.text.trim();
        const lower = href.toLowerCase();
        const ok = href && name &&
          href.indexOf(slug) >= 0 &&
          (lower.indexOf('/chapter') >= 0 || lower.indexOf('/extra') >= 0);
        return ok ? { id: href, title: name } : null;
      }).filter(Boolean);
      const descParas = Html.list(body, '.tdb_single_content .tdb-block-inner p', (el) => el.text.trim())
        .filter(Boolean);
      return {
        title: Html.text(body, 'h1').trim() || id,
        cover: '',
        description: descParas.join('\n'),
        chapters: chapters
      };
    },
    loadChapter: async (workId, chapterId) => {
      const body = await this.fetchOk(chapterId);
      let paras = Html.list(body, '.tdb-block-inner p', (el) => el.text.trim()).filter(Boolean);
      if (!paras.length) paras = Html.list(body, 'p', (el) => el.text.trim()).filter(Boolean);
      return { content: paras.join('\n\n'), format: 'plain' };
    }
  };
}
