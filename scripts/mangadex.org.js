// ==SourceScript==
// @name        MangaDex
// @key         mangadex.org
// @version     1.0.0
// @apiVersion  4
// @minApp      1.0.0
// @kind        manga
// @domains     api.mangadex.org,uploads.mangadex.org,mangadex.org
// @capabilities search,comic,explore
// ==/SourceScript==

/**
 * Kurisa v4 源：MangaDex（漫画 JSON API 站）。
 * 数据流改写自 MIT 许可的公开实现（仅对接其公开 JSON API 的字段形状，
 * 未复制原脚本；URL 构建改用显式拼接以兼容无 URL 构造器的运行环境）。
 * 反爬分类：429/503 → throwRateLimited；404 → throwNotFound；其余按原文抛出。
 */
class MangaDex extends ComicSource {
  constructor() {
    super();
    this.name = 'MangaDex';
    this.key = 'mangadex.org';
    this.version = '1.0.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 4;
    this.kind = ['manga'];
    this.domains = ['api.mangadex.org', 'uploads.mangadex.org', 'mangadex.org'];
    this.capabilities = ['search', 'comic', 'explore'];
  }

  get apiUrl() {
    return 'https://api.mangadex.org';
  }

  get headers() {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  buildQuery(params) {
    const parts = [];
    const push = function (k, v) {
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    };
    Object.keys(params).forEach(function (k) {
      const v = params[k];
      if (Array.isArray(v)) {
        v.forEach(function (item) { push(k, item); });
      } else if (v !== null && typeof v === 'object') {
        Object.keys(v).forEach(function (sk) { push(k + '[' + sk + ']', v[sk]); });
      } else if (v !== undefined && v !== null) {
        push(k, v);
      }
    });
    return parts.join('&');
  }

  async request(endpoint, params) {
    const qs = this.buildQuery(params || {});
    const url = this.apiUrl + endpoint + (qs ? '?' + qs : '');
    const res = await Network.get(url, this.headers);
    if (res.status === 429 || res.status === 503) throwRateLimited('MangaDex 限流/维护：' + res.status);
    if (res.status === 404) throwNotFound('MangaDex 资源不存在：' + endpoint);
    if (res.status !== 200) throw new Error('MangaDex 请求失败: ' + res.status);
    return JSON.parse(res.body);
  }

  parseManga(data) {
    const attrs = data.attributes || {};
    const id = data.id;
    const titles = attrs.title || {};
    const title = titles.en || titles.ja || titles['zh-HK'] || titles['zh-CN'] ||
      Object.values(titles)[0] || 'Unknown';
    const descs = attrs.description || {};
    const desc = descs.en || descs.ja || descs['zh-HK'] || descs['zh-CN'] ||
      Object.values(descs)[0] || '';
    let cover = '';
    const rels = data.relationships || [];
    for (let i = 0; i < rels.length; i++) {
      if (rels[i].type === 'cover_art' && rels[i].attributes && rels[i].attributes.fileName) {
        cover = 'https://uploads.mangadex.org/covers/' + id + '/' + rels[i].attributes.fileName;
        break;
      }
    }
    const tags = [];
    if (attrs.tags) {
      for (let i = 0; i < attrs.tags.length; i++) {
        const n = attrs.tags[i] && attrs.tags[i].attributes && attrs.tags[i].attributes.name;
        if (n && n.en) tags.push(n.en);
      }
    }
    const authors = [];
    for (let i = 0; i < rels.length; i++) {
      if ((rels[i].type === 'author' || rels[i].type === 'artist') &&
          rels[i].attributes && rels[i].attributes.name) {
        authors.push(rels[i].attributes.name);
      }
    }
    return {
      id: id,
      title: title,
      subTitle: attrs.originalLanguage || '',
      cover: cover,
      tags: tags,
      authors: authors,
      description: desc
    };
  }

  explore = [{
    title: 'MangaDex',
    type: 'multiPageComicList',
    load: async (page) => {
      const result = {};
      const latest = await this.request('/manga', {
        'includes[]': 'cover_art',
        'order[latestUploadedChapter]': 'desc',
        limit: 20,
        offset: (page - 1) * 20
      });
      if (latest.data && latest.data.length) {
        result['最新更新'] = latest.data.map((d) => this.parseManga(d));
      }
      if (page === 1) {
        const popular = await this.request('/manga', {
          'includes[]': 'cover_art',
          'order[followedCount]': 'desc',
          limit: 20
        });
        if (popular.data && popular.data.length) {
          result['最受欢迎'] = popular.data.map((d) => this.parseManga(d));
        }
      }
      return result;
    }
  }];

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const res = await this.request('/manga', {
        title: keyword,
        'includes[]': 'cover_art',
        limit: 20,
        offset: (page - 1) * 20,
        'contentRating[]': ['safe', 'suggestive', 'erotica']
      });
      return {
        works: (res.data || []).map((d) => {
          const w = this.parseManga(d);
          return { id: w.id, title: w.title, cover: w.cover, tags: w.tags, kind: 'manga' };
        }),
        maxPage: Math.ceil((res.total || 0) / 20)
      };
    },
    page: async (keyword, options, pageOrNext) => {
      if (typeof pageOrNext === 'number') {
        return await this.search.load(keyword, options, pageOrNext);
      }
      return { works: [], maxPage: 1 };
    }
  };

  comic = {
    loadInfo: async (id) => {
      const data = await this.request('/manga/' + id, {
        'includes[]': ['cover_art', 'author', 'artist', 'scanlation_group']
      });
      const manga = data.data;
      const w = this.parseManga(manga);
      const chapters = [];
      let offset = 0;
      const limit = 100;
      while (true) {
        const feed = await this.request('/manga/' + id + '/feed', {
          'translatedLanguage[]': ['en', 'zh', 'zh-HK', 'zh-CN'],
          limit: limit,
          offset: offset,
          'order[chapter]': 'asc'
        });
        if (!feed.data || !feed.data.length) break;
        for (let i = 0; i < feed.data.length; i++) {
          const c = feed.data[i];
          const num = (c.attributes && c.attributes.chapter) || '0';
          const ctitle = (c.attributes && c.attributes.title) || ('第 ' + num + ' 话');
          chapters.push({ id: c.id, title: ctitle });
        }
        if (feed.data.length < limit) break;
        offset += limit;
      }
      return { title: w.title, cover: w.cover, description: w.description, tags: w.tags, chapters: chapters };
    },
    loadEp: async (comicId, epId) => {
      const atHome = await this.request('/at-home/server/' + epId, {});
      const baseUrl = atHome.baseUrl;
      const chapter = atHome.chapter || {};
      const hash = chapter.hash || '';
      const pages = chapter.data || [];
      const useSaver = chapter.dataSaver && chapter.dataSaver.length;
      const images = pages.map(function (p) {
        return baseUrl + '/' + (useSaver ? 'data-saver' : 'data') + '/' + hash + '/' + p;
      });
      return { images: images };
    }
  };
}
