# Changelog

All notable changes to Widget Spotify are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/).

## [0.3.0] - Unreleased

### Added
- **Six styles** for the card, chosen in the settings: **Vetro** (*Glass*, with a light or
  full glow), **Aurora** (*Night*, *Sunset*, *Forest*), **Classico** (*Classic*, the look of
  earlier versions), **Ambiente** (*Ambient*, colours taken from the album art), **Poster**
  (the album art fills the card) and **Vinile** (*Vinyl*, a record that spins while playing).
  New installs and updated ones start with **Ambiente**.
- **Light, dark or like Windows** theme.
- **Compact** size: a one-line card with album art, title, artist, previous / play / next and a
  thin progress bar. Login and "nothing playing" still use the full card.
- **Animations** for track changes, buttons and moving backgrounds, with an on/off switch. They
  also stay off when Windows' *reduce animations* setting is on.
- The device that is playing is shown above the title.
- `npm run make-screenshots` regenerates the images in `docs/screenshots/` with a made-up song.
- `SHA256SUMS.txt` and `VERIFY.ps1` in every release, to check the downloaded exe.

### Changed
- New card layout for every style: bigger album art, titles on up to two lines, a full-width
  progress bar with the elapsed time and the time left underneath, shuffle and repeat at the
  sides with a dot when they are on.
- The settings window is taller (400×640) and groups the options under **Aspetto**
  (*Appearance*) and **Finestra** (*Window*).
- New screenshots, demo GIF and social preview.
- The landing page uses the same design as the other projects and switches between English
  and Italian.

### Removed
- The **Copertina come sfondo** (*Album-art background*) switch: Ambient, Poster and Vinyl use
  the album art instead. The old setting is ignored.

## [0.2.3] - 2026-10-31

### Changed
- The widget only checks Spotify while the card is open. Before, it polled every 5 seconds
  even when hidden (around 17,000 requests a day).
- When Spotify asks to slow down (rate limit), the widget waits as long as Spotify requests
  instead of retrying every second. Buttons pressed meanwhile show
  *"Troppe richieste a Spotify"*.
- **Accedi / Ri-autentica** in the tray menu keeps your current login until the new one
  succeeds. Before, cancelling the new login left you logged out.
- The login no longer asks for the `user-read-currently-playing` permission, which the widget
  never used. Existing logins keep working.
- Updated Electron to 43.8.6 (security fixes), electron-updater to 6.8.11 and
  electron-builder to 26.18.

### Fixed
- If Spotify access is revoked or expires, the card goes back to the login screen instead of
  showing an error every second.
- Logging in again a few seconds after a previous login could hang.
- An unfinished login no longer keeps the login port busy forever: it expires after 5 minutes
  (*"Accesso scaduto: riprova"*).
- A clear message, *"Porta del login occupata da un altro programma"*, when another program
  is using the login port.
- **Esci** (*Quit*) now closes the app properly, so a downloaded update is installed on quit.
- Fewer disk reads and fewer token requests: the refresh token is kept in memory, and
  simultaneous token refreshes are merged into one request.

### Security
- The settings window can no longer access playback and login commands.
- Device names from Spotify are shown as plain text, never interpreted as HTML.

### Project
- English-only README with setup, usage, troubleshooting and privacy sections.
- GitHub Pages landing page and Buy Me a Coffee link.
- CI on every pull request (ESLint, Prettier, test Windows build); builds now use Node 24.
- Dependabot opens one grouped pull request per month; major versions are upgraded by hand.

## [0.2.2] - 2026-07-17

### Changed
- Updated Electron to 43.1.1 and electron-builder to 26.15.

## [0.2.1] - 2026-07-17

### Added
- Volume slider and mute button on the card.

## [0.2.0] - 2026-07-14

### Added
- Automatic updates from GitHub Releases (installer version).

## [0.1.0] - 2026-07-14

### Added
- First release: tray card with now playing, playback controls, seek bar, device switcher,
  settings and OAuth PKCE login.

[0.3.0]: https://github.com/giosci1994/widget-spotify/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/giosci1994/widget-spotify/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/giosci1994/widget-spotify/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/giosci1994/widget-spotify/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/giosci1994/widget-spotify/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/giosci1994/widget-spotify/releases/tag/v0.1.0
