# 🎵 Widget Spotify

**Mini-telecomando di Spotify che vive nella system tray di Windows.**
Un click sull'icona e appare una card "now playing" con controlli, barra di
avanzamento e selettore di dispositivo — senza aprire l'app Spotify.

> *A tiny Spotify remote that lives in the Windows system tray. Control playback,
> seek, switch speakers (Echo, PC, phone…) from a click-to-reveal card.*

Funziona tramite la **Spotify Web API**, quindi controlla il *dispositivo attivo*
del tuo account: PC, telefono o smart speaker (es. Amazon Echo).

<p align="center">
  <img src="docs/screenshots/widget.png" width="420" alt="La card del widget nell'angolo dello schermo" />
</p>

---

## ✨ Funzioni

- 🎧 **Now playing**: copertina, titolo, artista, album
- ⏯️ **Controlli**: play/pausa, avanti/indietro, shuffle, repeat
- 🎚️ **Barra cliccabile** per il seek, con avanzamento animato
- 🖥️ **Selettore di dispositivo**: sposta la musica su Echo / PC / telefono
- 🪟 **Da system tray**: click per mostrare/nascondere, si chiude da sola quando clicchi altrove
- ⚙️ **Impostazioni**: angolo di comparsa, dissolvenza, trasparenza, copertina come sfondo, avvio all'accensione
- 🔒 **Sicuro**: login OAuth **PKCE** (nessun *client secret*), refresh token cifrato con DPAPI di Windows

<p align="center">
  <img src="docs/screenshots/tray-menu.png" width="200" alt="Menu tasto destro" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/settings.png" width="320" alt="Finestra impostazioni" />
</p>

---

## ⚠️ Prima di iniziare

- Serve un account **Spotify Premium** (i comandi di riproduzione della Web API
  non funzionano con Free — la sola visualizzazione sì).
- **Devi creare una tua app Spotify** e usare il *tuo* Client ID: l'app di
  qualcun altro è in "Development mode" e funziona solo per gli utenti che ha
  autorizzato. È gratis e richiede 5 minuti (vedi sotto).
- Progetto **non ufficiale**, non affiliato con Spotify.

---

## 🚀 Installazione (utente)

1. Scarica l'ultima release dalla pagina **[Releases](../../releases)**:
   - `Widget Spotify Setup x.y.z.exe` → installer, oppure
   - `WidgetSpotify-portable-x.y.z.exe` → eseguibile singolo, senza installare.
2. Avvia. Compare l'icona verde nella tray.
3. Registra la tua app Spotify (passo sotto) e **incolla il Client ID** nel widget.

> Nota: l'eseguibile non è firmato, quindi Windows SmartScreen potrebbe mostrare
> un avviso — *Ulteriori informazioni → Esegui comunque*.

### Registra la tua app Spotify (gratis)

1. Vai su **https://developer.spotify.com/dashboard** e accedi → **Create app**.
2. **Redirect URI** (incolla esatto, poi *Add*):
   ```
   http://127.0.0.1:8888/callback
   ```
   (usa `127.0.0.1`, non `localhost`)
3. Spunta **Web API** → salva.
4. Apri l'app → **Settings** → copia il **Client ID** (il *secret* non serve).
5. **User Management** → aggiungi l'email del tuo account Spotify.
6. Nel widget: click sull'icona → **incolla il Client ID** → **Accedi con Spotify**.

Se il browser predefinito dà errore al login, usa il pulsante **"Copia link di
accesso"** e incolla il link in un browser dove sei già loggato a Spotify.

---

## 🛠️ Sviluppo

```bash
git clone https://github.com/giosci1994/widget-spotify.git
cd widget-spotify
npm install
npm start
```

Al primo avvio incolla il Client ID nel widget (viene salvato in
`%APPDATA%/widget-spotify/config.json`).
In alternativa puoi creare un `config.json` nella root del progetto:

```json
{ "clientId": "IL_TUO_CLIENT_ID", "port": 8888 }
```

(È `.gitignore`-ato: non verrà mai committato.)

### Build dell'eseguibile

```bash
npm run dist     # installer NSIS + portable in dist/
npm run pack     # solo cartella non pacchettizzata (test veloce)
```

---

## 🧩 Struttura

```
src/
  main.js        processo principale: tray, finestra, polling, IPC
  auth.js        OAuth PKCE + gestione/refresh token + config multi-sorgente
  spotify.js     wrapper Web API (/me/player)
  preload.js     ponte sicuro main <-> renderer
  renderer/      UI della card (html/css/js)
  settings/      finestra impostazioni
scripts/
  make-icon.js   genera le icone (tray.png, icon.png, icon.ico)
```

---

## 🔐 Privacy

- Il **refresh token** è salvato cifrato (DPAPI di Windows) in
  `%APPDATA%/widget-spotify/`.
- Il widget parla **solo** con `accounts.spotify.com` e `api.spotify.com`.
- Nessun dato viene inviato a terzi.

## 📄 Licenza

[MIT](LICENSE) © giosci1994
