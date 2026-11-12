// ==SourceScript==
// @name        动漫屋
// @key         dm5.com
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        manga
// @domains     m.dm5.com,www.dm5.com,cdndm5.com
// @capabilities search,comic,explore,settings,htmlHelper,imageLoad
// ==/SourceScript==

/**
 * Kurisa v4 源：动漫屋（DM5，服务端 HTML + 部分章节页 JS 生成图片）。
 * 数据流改写自 MIT 许可的公开实现（仅沿用其站点接口：URL 形态与选择器；未复制原脚本）。
 * 差异（能力边界，明确记录）：
 * - 原稿用宿主 `compute()` 执行页面内 `var newImgs = [...]` 与 eval-packer 解密取图；
 *   Kurisa 无 JS 内联执行能力（单发模型 + 无 compute 桥），故**只保留 DOM 懒加载路径**，
 *   并对图片域名做 `cdndm5.com` 过滤；拿不到图时返回空数组而非伪造。
 * 反爬分类：429/503 → throwRateLimited；404 → throwNotFound。
 */
class Dm5 extends ComicSource {
  constructor() {
    super();
    this.name = '动漫屋';
    this.key = 'dm5.com';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['manga'];
    this.domains = ['m.dm5.com', 'www.dm5.com', 'cdndm5.com'];
    this.capabilities = ['search', 'comic', 'explore', 'settings', 'htmlHelper', 'imageLoad'];
    this.settings = {
      domains: {
        title: '选择域名',
        type: 'select',
        options: [
          { value: 'https://m.dm5.com', text: 'm.dm5.com（主站）' },
          { value: 'https://www.dm5.com', text: 'www.dm5.com（备用）' }
        ],
        default: 'https://m.dm5.com'
      }
    };
  }

  baseUrl() {
    return this.loadSetting('domains') || 'https://m.dm5.com';
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
    const title = Html.text(html, '.manga-list-2-title, .manga-book-list-main-title, .title') || Html.text(html, 'a');
    if (!href || !title) return null;
    const id = href.split('/').filter(Boolean).pop().replace('.html', '');
    return {
      id: id,
      title: title.trim(),
      cover: this.fixUrl(
        Html.attr(html, 'img', 'data-src') || Html.attr(html, 'img', 'src')
      ),
      update: Html.text(html, '.manga-list-1-tip, .new-search-list-right')
    };
  }

  // 章节 id 归一：兼容 `/m100/`（移动端尾斜杠）与 `/manhua-w1/100.html`（PC），
  // 统一取纯数字，供 loadEp 拼 /m<id>/ 或回退 .html 形态。
  chapterIdOf(href) {
    let h = href || '';
    h = h.replace(/\/+$/, '');
    let seg = h.split('/').pop();
    seg = seg.replace(/\.html$/, '');
    if (seg.length > 1 && seg.charAt(0) === 'm' && /^\d+$/.test(seg.substring(1))) {
      seg = seg.substring(1);
    }
    return seg;
  }

  async fetchOk(url) {
    const res = await Network.get(url, this.headers());
    if (res.status === 429 || res.status === 503) throwRateLimited('动漫屋访问受限：' + res.status);
    if (res.status === 404) throwNotFound('页面不存在：' + url);
    if (res.status !== 200) throw new Error('动漫屋请求失败: ' + res.status);
    return res.body;
  }

  explore = [{
    title: '动漫屋',
    type: 'multiPartPage',
    load: async (page) => {
      const body = await this.fetchOk(page === 1 ? this.baseUrl() : this.baseUrl() + '/page/' + page + '/');
      const result = {};
      const hot = Html.list(body, '.manga-book-list-main', (el) => this.parseCard(el.innerHtml)).filter(Boolean);
      if (hot.length) result['精品书单'] = hot;
      const fresh = Html.list(body, '.manga-list-1 li', (el) => this.parseCard(el.innerHtml)).filter(Boolean);
      if (fresh.length) result['强势安利'] = fresh;
      const rank = Html.list(body, '.rank-list li, .rank-list-cover', (el) => this.parseCard(el.innerHtml)).filter(Boolean);
      if (rank.length) result['排行榜'] = rank;
      return result;
    }
  }];

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const body = await this.fetchOk(
        this.baseUrl() + '/search.ashx?key=' + encodeURIComponent(keyword) + '&page=' + page
      );
      const items = Html.list(body, '.new-search-list-item', (el) => this.parseCard(el.innerHtml)).filter(Boolean);
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
      // 站点存在两种详情页形态，按原稿顺序回退。
      let body;
      try {
        body = await this.fetchOk(this.baseUrl() + '/manhua-' + id + '/');
      } catch (e) {
        body = await this.fetchOk(this.baseUrl() + '/' + id + '/');
      }
      const chapters = Html.list(body, '.detail-list-1.detail-list-select .chapteritem', (el) => {
        const href = el.attributes && el.attributes.href ? el.attributes.href : '';
        const title = el.text.trim();
        const cid = this.chapterIdOf(href);
        if (!cid || !title) return null;
        return { id: cid, title: title };
      }).filter(Boolean);
      return {
        title: Html.text(body, '.detail-main-info-title') || id,
        cover: this.fixUrl(Html.attr(body, '.detail-main-cover img', 'src')),
        description: Html.text(body, '.detail-desc'),
        chapters: chapters
      };
    },
    loadEp: async (comicId, epId) => {
      let body;
      try {
        body = await this.fetchOk(this.baseUrl() + '/m' + epId + '/');
      } catch (e) {
        body = await this.fetchOk(this.baseUrl() + '/manhua-' + comicId + '/' + epId + '.html');
      }
      // 仅 DOM 懒加载路径（见文件头：无 compute/eval 能力）。
      const urls = Html.list(body, '#cp_img img, .view-main-1 img, .read-content img', (el) => {
        const u = el.attributes['data-src'] || el.attributes['src'] || '';
        return (u && u.indexOf('cdndm5.com') >= 0) ? this.fixUrl(u) : '';
      }).filter(Boolean);
      return { images: urls };
    },
    onImageLoad: (url, comicId, epId) => ({
      url: url,
      headers: { 'Referer': 'https://www.dm5.com/' }
    })
  };
}
