# Vendored assets

## katex.min.js

- Version: 0.19.1
- Source: https://github.com/KaTeX/KaTeX/releases/tag/v0.19.1 (`dist/katex.min.js`)
- License: MIT, see `LICENSE-KaTeX.txt`

The extension loads this copy only when the host page provides neither its own
KaTeX instance nor a usable `katex.render`. It is exposed through
`web_accessible_resources` so the isolated world can `import()` it.

To update: download `katex.min.js` from the release above, replace the file,
copy the matching `LICENSE` from the same tag, update the version here, then run
`npm test` and `npm run build`.
