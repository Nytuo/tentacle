<h1 align="center">
	<img src="public/logo.png" alt="Tentacle Logo" width="200">
</h1>
<div align="center">
<h2>Tentacle</h2>
A privacy-first, modern Git client inspired by GitKraken.
	<br />
	<br />
	<a href="https://github.com/Nytuo/tentacle/issues/new?assignees=&labels=bug&template=01_BUG_REPORT.md&title=bug%3A+">Report a Bug</a>
	·
	<a href="https://github.com/Nytuo/tentacle/issues/new?assignees=&labels=enhancement&template=02_FEATURE_REQUEST.md&title=feat%3A+">Request a Feature</a>
		· <a href="https://github.com/Nytuo/tentacle/discussions">Ask a Question</a>

</div>

<div align="center">
<br />

[![Project license](https://img.shields.io/github/license/Nytuo/tentacle.svg?style=flat-square)](LICENSE)

[![code with love by Nytuo](https://img.shields.io/badge/%3C%2F%3E%20with%20%E2%99%A5%20by-Nytuo-ff1414.svg?style=flat-square)](https://github.com/Nytuo)

</div>

> [!WARNING]
> Tentacle is still in development, and not an active one for the moment. So, it
> may contain bugs and cause git issues. Use at your own risk.

## About

Tentacle is a privacy-first Git client, aiming to provide a modern, beautiful,
and powerful interface for managing your repositories. Inspired by GitKraken,
Tentacle is built with Tauri, React, and Rust, and puts your data privacy first,
no analytics, no tracking, no cloud sync. All your work stays on your machine,
in the depths where Cthulhu dwells.

## What Tentacle Can Do

- **Visualize your repositories:**
  - Interactive commit graph across every branch, with search by message,
    author, hash or path
  - Branch management, tags, stashes, remotes and the reflog

- **Stage at any granularity** — whole files, single hunks, or individual lines

- **Rewrite history** — amend, cherry-pick, revert, reset, and interactive
  rebase with squash, fixup, reword, reorder and drop

- **Understand a file** — per-file history that follows renames, and
  line-by-line blame

- **Commit, merge, and resolve conflicts**, region by region

- **Worktrees, submodules and Git LFS** detection

- **Multi-repository support** — every tab is its own repository, isolated end
  to end

- **Privacy-first:**
  - No telemetry, no tracking, no ads, no cloud sync
  - Tokens live in your OS keychain, never in a settings file
  - Outbound provider requests are off until you turn them on
  - Settings are one JSON file you can inspect or erase from inside the app

- **Keyboard shortcuts** and a ⌘K command palette

- **Cross-platform:**
  - macOS, Windows, Linux

## Development

```bash
npm install
npm run tauri dev
```

Checks, all of which run in CI:

```bash
npm run typecheck && npm test && npm run build
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

## Authentication

Fetch, push and clone resolve credentials in order: your SSH agent, then SSH
keys in `~/.ssh`, then a token saved for that host in your OS keychain, then
your configured `credential.helper`.

## Technologies

<div style="display: flex; align-items: center; gap: 10px;">
		<img src="https://img.shields.io/badge/Rust-black?style=for-the-badge&logo=rust"/>
	<img src="https://img.shields.io/badge/NPM-black?style=for-the-badge&logo=npm"/>
<img src="https://img.shields.io/badge/NodeJS-black?style=for-the-badge&logo=node.js"/>
<img src="https://img.shields.io/badge/React-black?style=for-the-badge&logo=React"/>
<img src="https://img.shields.io/badge/vite-black?style=for-the-badge&logo=vite"/>
	<img src="https://img.shields.io/badge/typeScript-black?style=for-the-badge&logo=typescript"/>
<img src="https://img.shields.io/badge/TAURI-black?style=for-the-badge&logo=tauri"/>
</div>

## MacOS Troubleshooting

### Launching on MacOS

If you have trouble launching Tentacle on macOS, ensure you have the latest
version of [Tauri](https://tauri.app/) and
[Rust](https://www.rust-lang.org/tools/install) installed. You may need to allow
the app in your Security & Privacy settings.

## Authors & contributors

The original author of this repository is
[Arnaud BEUX](https://github.com/Nytuo).

For a full list of all authors and contributors, see
[the contributors page](https://github.com/Nytuo/tentacle/contributors).

## License

Tentacle is licensed under the **GNU General Public License v3**. Tentacle is
provided **"as is"** without any **warranty**. Use at your own risk. See
[LICENSE](LICENSE) for more information.
