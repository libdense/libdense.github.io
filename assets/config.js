/* libdense.github.io site configuration. Values only; logic is in site.js.
   Edit here when the repository, branch or docs folder changes. */
window.LIBDENSE_SITE = {
  /* Docs are read live from this repository path on every visit. */
  repo: { owner: "libdense", name: "libdense", branch: "main", docsDir: "docs" },

  links: {
    repo: "https://github.com/libdense/libdense",
    book: "https://www.amazon.com/dp/B0H86L5Y1B",
    bookTitle: "Dense-Region MMO Server Architecture",
    discord: "https://discord.gg/rhEp4vKFVr",
    commercial: "https://yggengine.com/commercial"
  },

  /* The viewer for the current release and its version stamp. */
  viewer: { page: "viewer/index.html", versionFile: "viewer/version.json" },

  docs: {
    home: ["README.md", "index.md"],   /* first one present opens at #/docs */
    listCacheMs: 5 * 60 * 1000,        /* doc list reuse within one browser tab */
    docCacheMs: 5 * 60 * 1000,         /* rendered doc reuse within one page load */
    filterAt: 12,                       /* show the filter box at this many docs */
    tocLevels: [2, 3],                  /* headings listed under ON THIS PAGE */
    tocMax: 60
  },

  /* Live sources, tried in order. jsDelivr mirrors GitHub and can lag it by
     some hours, so it is only a fallback. */
  sources: {
    list: [
      { id: "github", url: "https://api.github.com/repos/{owner}/{name}/git/trees/{branch}?recursive=1" },
      { id: "jsdelivr", url: "https://data.jsdelivr.com/v1/packages/gh/{owner}/{name}@{branch}?structure=flat" }
    ],
    file: [
      { id: "github", url: "https://raw.githubusercontent.com/{owner}/{name}/{branch}/{path}" },
      { id: "jsdelivr", url: "https://cdn.jsdelivr.net/gh/{owner}/{name}@{branch}/{path}" }
    ],
    blob: "https://github.com/{owner}/{name}/blob/{branch}/{path}",
    tree: "https://github.com/{owner}/{name}/tree/{branch}/{path}",
    /* image formats raw.githubusercontent.com serves with a type browsers accept */
    rawImage: "https://raw.githubusercontent.com/{owner}/{name}/{branch}/{path}",
    cdnImage: "https://cdn.jsdelivr.net/gh/{owner}/{name}@{branch}/{path}",
    cdnImageExt: ["svg"]
  }
};
