# Encounter Tracker

An Owlbear Rodeo extension by **CorgiTheCat**. Manage initiative, rounds, character portraits and turn controls in a shared encounter with a fantasy-themed interface.

Read the [How to Use guide](https://encounter-tracker-gxvc.onrender.com/guide/) for installation, controls and troubleshooting.

## Features

- Add one or multiple Scene Tokens through **Add to Encounter**, or choose characters from Assets.
- Use a custom portrait in the tracker without changing the Scene Token image.
- Separate local Edit/Encounter views; shared roster, round and turn data.
- S/M/L encounter bar, highlighted active combatant, and round-based time display.
- Mark characters **Dead** or **Revive** them without deleting Scene Tokens.
- DM-controlled **Player turns** switch. Players may view encounters regardless of turn permission.
- Optional per-player camera follow; asset-only characters are skipped.
- Confirmation before clearing the shared encounter.
- Connection status, up to three automatic connection attempts, and manual Retry.
- Owlbear SDK 3.1.0 included locally; no runtime SDK CDN request.

## Requirements and commands

Node.js 22 or newer. Normal builds have no npm dependencies; the already-built SDK and its license notices are committed in `src/vendor/`.

```sh
npm ci
npm test
npm run dev
```

`npm test` builds `dist/` and validates JavaScript syntax, manifest fields and required files. It is **not** a live multiplayer test. `npm run dev` builds once and serves locally; after editing, build again and refresh. `npm run preview` serves the existing `dist/`.

The tracker is an extension, not a standalone website. Opening its URL directly displays instructions to open it inside Owlbear Rodeo. Use an HTTPS deployment for testing from different computers or phones.

## Deploy from GitHub to Netlify

1. Put this folder's **contents** at the repository root. `package.json`, `netlify.toml`, `src/`, and `public/` should be visible at the top level.
2. Connect that repository to your Netlify project.
3. The included `netlify.toml` sets build command **`npm run build`**, publish directory **`dist`**, and Node **22**. No secret environment variables are required.
4. After publishing, open `https://YOUR-SITE.netlify.app/manifest.json` and check that it returns JSON, not a 404 page.
5. Use that manifest URL to install the custom extension in Owlbear Rodeo. For an existing installation on the same domain, refresh Owlbear to load the new deployment.

Manual deployment is also possible: run `npm run build` and upload the **contents of `dist/`**, not this source archive. The manifest must be at the deployed site root. Preserve forward-slash paths if creating a ZIP.

Netlify configuration reference: https://docs.netlify.com/build/configure-builds/file-based-configuration/

This configuration targets a site's root. GitHub project Pages uses a repository subpath and is **not configured** here; uploading code to GitHub alone does not host the extension.

## Repository layout

```text
index.html       Entry page
src/             UI, encounter logic, CSS and bundled SDK
public/          Owlbear manifest, logo, icon and Netlify headers
scripts/         Dependency-free build, checks and local server
tools/sdk/       Optional SDK rebuild tool and dependency lockfile
netlify.toml     Deployment settings
docs/            Upload instructions and manual test checklist
dist/            Generated deployment (not committed)
```

Edit `public/manifest.json` to change the extension listing. Keep its version consistent with `package.json`. Keep the existing metadata keys when updating an installed tracker so saved encounters remain accessible.

## Data and limitations

Encounter state is stored through Owlbear Scene/Room metadata; it is not contained in this repository or ZIP. Portraits use Asset references. Never commit private room exports, player information or credentials.

Permission controls are client-side extension behavior, not a server-enforced security boundary. Test live synchronization with two different accounts before a session. See `docs/TESTING.md`.

## Optional: rebuild the bundled SDK

Not required to deploy. Maintainers can reproduce the SDK bundle from the separately locked dependencies:

```sh
npm ci --prefix tools/sdk --ignore-scripts
node tools/sdk/build.cjs
npm test
```

This optional step downloads build dependencies. Keep `tools/sdk/package-lock.json` and third-party notices when updating the SDK.

## License

No open-source license for the original application or artwork has been selected. `UNLICENSED` in package metadata does not grant reuse rights. The owner should choose a license before inviting public reuse. Bundled third-party libraries retain their own licenses; see `THIRD_PARTY_NOTICES.md`.
