// ==SourceScript==
// @name Template Novel (rename me)
// @key template.novel
// @version 0.1.0
// @apiVersion 2
// @minApp 1.0.0
// @kind novel
// @domains example.invalid
// @capabilities search
// ==/SourceScript==

// 小说模板：无状态写法（不挂 this，不依赖 init 残留），正文 format 必填。不含任何真实站点（C1）。
class TemplateNovel extends ComicSource {
  constructor() {
    super();
    this.key = 'template.novel';
    this.name = 'Template Novel';
    this.version = '0.1.0';
    this.minAppVersion = '1.0.0';
    this.apiVersion = 2;
    this.kind = ['novel'];
    this.domains = ['example.invalid'];
  }
  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const url = 'https://example.invalid/search?q=' + encodeURIComponent(keyword) + '&page=' + page;
      const res = await Network.get(url, {});
      const doc = new HtmlDocument(res.body);
      // TODO: 映射 [{ id, title }]，数组形式。
      const works = [];
      doc.dispose();
      return { works: works, maxPage: 1 };
    }
  };
  novel = {
    loadInfo: async (id) => {
      // TODO: 取目录，返回 { work: {...}, chapters: [{ id, title }] }（卷章两级请拍平或加卷前缀）。
      return { work: { id: id, title: 'TODO', kind: 'novel' }, chapters: [] };
    },
    loadChapter: async (workId, chapterId) => {
      // TODO: 取正文；html 进清洗通道，纯文本 format 填 plain；文内图走 onImageResolve（v4）。
      return { content: '', format: 'plain' };
    }
  };
}