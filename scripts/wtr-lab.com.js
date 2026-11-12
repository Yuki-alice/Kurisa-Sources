// ==SourceScript==
// @name        WTR-LAB
// @key         wtr-lab.com
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        novel
// @domains     wtr-lab.com,www.wtr-lab.com
// @capabilities search,novel,novelChapter,explore,htmlHelper
// ==/SourceScript==

/**
 * Kurisa v4 源：WTR-LAB（英文翻译小说，Next.js 数据岛 + JSON API）。
 * 数据流改写自 MIT 许可的公开实现（仅沿用其站点接口：__NEXT_DATA__ 数据岛、
 * /api/search、/api/chapters/{id}、/api/reader/get 的字段语义；未复制原脚本）。
 * 差异（安全）：原稿正文优先经第三方代理 `wtr-scraper.vercel.app` 抓取，
 * 该代理不在本站域名内、属未知供应链；Kurisa 版**只走本站 API**，不引入外部代理。
 * 反爬分类：429/503 → throwRateLimited；404 → throwNotFound。
 */
class WtrLab extends ComicSource {
  constructor() {
    super();
    this.name = 'WTR-LAB';
    this.key = 'wtr-lab.com';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['novel'];
    this.domains = ['wtr-lab.com', 'www.wtr-lab.com'];
    this.capabilities = ['search', 'novel', 'novelChapter', 'explore', 'htmlHelper'];
  }

  baseUrl() {
    return 'https://wtr-lab.com';
  }

  headers() {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0',
      'Accept': 'application/json, text/html'
    };
  }

  async getOk(path) {
    const res = await Network.get(this.baseUrl() + path, this.headers());
    if (res.status === 429 || res.status === 503) throwRateLimited('WTR-LAB 访问受限：' + res.status);
    if (res.status === 404) throwNotFound('资源不存在：' + path);
    if (res.status !== 200) throw new Error('WTR-LAB 请求失败: ' + res.status);
    return res.body;
  }

  async postJson(path, payload) {
    const res = await Network.post(
      this.baseUrl() + path,
      { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      JSON.stringify(payload)
    );
    if (res.status === 429 || res.status === 503) throwRateLimited('WTR-LAB 访问受限：' + res.status);
    if (res.status === 404) throwNotFound('资源不存在：' + path);
    if (res.status !== 200) throw new Error('WTR-LAB 请求失败: ' + res.status);
    return JSON.parse(res.body);
  }

  // 从 Next.js 页面数据岛取 JSON（站点详情的唯一可靠数据源）。
  nextData(html) {
    const open = '<script id="__NEXT_DATA__" type="application/json">';
    const i = html.indexOf(open);
    if (i < 0) return null;
    const start = i + open.length;
    const end = html.indexOf('</script>', start);
    if (end < 0) return null;
    return JSON.parse(html.substring(start, end));
  }

  mapSeries(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const rawId = item.raw_id || item.id;
      const data = item.data || {};
      const title = data.title || item.title;
      const cover = data.image || item.image || '';
      const slug = item.slug || 'novel';
      if (!title || !rawId) continue;
      out.push({
        id: this.baseUrl() + '/en/novel/' + rawId + '/' + slug,
        title: title,
        cover: cover
      });
    }
    return out;
  }

  explore = [{
    title: 'WTR-LAB',
    type: 'multiPageComicList',
    load: async (page) => {
      const body = await this.getOk('/en/novel-list');
      const parsed = this.nextData(body);
      const series = (parsed && parsed.props && parsed.props.pageProps && parsed.props.pageProps.series) || [];
      const items = this.mapSeries(series).map((w) => ({ ...w, kind: 'novel' }));
      const result = {};
      if (items.length) result['小说列表'] = items;
      return result;
    }
  }];

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const kw = (keyword || '').trim() || 'the';
      const res = await this.postJson('/api/search', { text: kw });
      const items = this.mapSeries(res && res.data ? res.data : []).map((w) => ({ ...w, kind: 'novel' }));
      return { works: items, maxPage: 1 };
    },
    page: async (keyword, options, pageOrNext) => {
      if (typeof pageOrNext === 'number') return await this.search.load(keyword, options, pageOrNext);
      return { works: [], maxPage: 1 };
    }
  };

  novel = {
    loadInfo: async (id) => {
      const path = id.indexOf('http') === 0 ? id.replace(this.baseUrl(), '') : id;
      const body = await this.getOk(path);
      const parsed = this.nextData(body);
      const serie = parsed && parsed.props && parsed.props.pageProps && parsed.props.pageProps.serie;
      if (!serie || !serie.serie_data) throw new Error('WTR-LAB 详情页缺少 serie 数据岛');
      const sd = serie.serie_data;
      const data = sd.data || {};
      const rawId = sd.raw_id || sd.id;
      const slug = sd.slug || 'novel';
      const chaptersRaw = await this.getOk('/api/chapters/' + rawId);
      const chaptersJson = JSON.parse(chaptersRaw);
      const chapters = [];
      const arr = (chaptersJson && chaptersJson.chapters) || [];
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        const no = c.order || 1;
        const title = c.title || c.name || ('Chapter ' + no);
        chapters.push({
          id: this.baseUrl() + '/en/novel/' + rawId + '/' + slug + '/chapter-' + no + '?chapter_id=' + c.id,
          title: title
        });
      }
      return {
        title: data.title || '',
        cover: data.image || '',
        description: data.description || '',
        chapters: chapters
      };
    },
    loadChapter: async (workId, chapterId) => {
      const url = chapterId.indexOf('http') === 0 ? chapterId : this.baseUrl() + chapterId;
      const noMatch = url.match(/chapter-(\d+)/i);
      const chapterNo = noMatch ? parseInt(noMatch[1]) : 1;
      const idMatch = url.match(/\/novel\/(\d+)\//i);
      const rawId = idMatch ? parseInt(idMatch[1]) : 0;
      const cidMatch = url.match(/chapter_id=(\d+)/i);
      const chapterIdNum = cidMatch ? parseInt(cidMatch[1]) : 0;
      const res = await this.postJson('/api/reader/get', {
        translate: 'web',
        language: 'en',
        raw_id: rawId,
        chapter_no: chapterNo,
        retry: false,
        force_retry: false,
        chapter_id: chapterIdNum
      });
      const payload = (res && res.data) || res || {};
      const inner = payload.data || payload;
      let body = inner.content || inner.body || payload.content || payload.body || '';
      let paras = [];
      if (Array.isArray(body)) {
        paras = body.map(function (x) { return typeof x === 'string' ? x : JSON.stringify(x); });
      } else if (typeof body === 'string' && body.trim().length > 0) {
        paras = cleanNovelHtml(body)
          .split(/\r?\n/)
          .map(function (t) { return t.trim(); })
          .filter(function (t) { return t.length > 0; });
      }
      return { content: paras.join('\n'), format: 'plain' };
    }
  };
}
