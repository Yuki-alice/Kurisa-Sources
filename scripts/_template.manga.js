// ==SourceScript==
// @name Template Manga (rename me)
// @key template.manga
// @version 0.1.0
// @apiVersion 2
// @minApp 1.0.0
// @kind manga
// @domains example.invalid
// @capabilities search
// ==/SourceScript==

// 漫画模板：复制后改 key/name/domains，按 TODO 填三处。不含任何真实站点（C1）。
class TemplateManga extends ComicSource {
  constructor() {
    super();
    this.key = 'template.manga';
    this.name = 'Template Manga';
    this.version = '0.1.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 2;
    this.kind = ['manga'];
    this.domains = ['example.invalid'];
  }
  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const url = 'https://example.invalid/search?q=' + encodeURIComponent(keyword) + '&page=' + page;
      const res = await Network.get(url, {});
      const doc = new HtmlDocument(res.body);
      // TODO: 用 doc.querySelectorAll 映射 [{ id, title }]，数组形式（v4 要求）。
      const works = [];
      doc.dispose();
      return { works: works, maxPage: 1 };
    }
  };
  comic = {
    loadInfo: async (id) => {
      // TODO: 取详情，返回 { work: {...}, chapters: [{ id, title }] }。
      return { work: { id: id, title: 'TODO', kind: 'manga' }, chapters: [] };
    },
    loadEp: async (comicId, epId) => {
      // TODO: 返回 { images: [...] }；防盗链头只给业务头（cookie/UA 会被剥离）。
      return { images: [] };
    }
  };
}