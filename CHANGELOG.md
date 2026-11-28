# Changelog

Changes to the public browser demo, grouped by commit date.

## 2026-11-28

- Added backup progress and result messages, with a timeout for compression and file writes. ([04581b5](https://github.com/utaani/unkernel-node-red/commit/04581b5b492963b0d3aaf910a627feadcc2192d9))
- Added local backups for Node-RED flows, settings, and installed nodes, with same-tab restore and a save dialog in supported browsers. ([d480f44](https://github.com/utaani/unkernel-node-red/commit/d480f4469155b74373383dc39c21f7ac59f4b193))

## 2026-11-27

- Added the dashboard screenshot and a caption about Microsoft Edge split screen to the English README. ([bc33e51](https://github.com/utaani/unkernel-node-red/commit/bc33e510e1b227c10228b6fae168fd8b5354604c))
- Documented the Dashboard 2 editor 404 workaround and added a shared screenshot of the setting. ([512a12b](https://github.com/utaani/unkernel-node-red/commit/512a12b8f644e732854624b45c03c3d7b6f3f86b))
- Made Reload editor re-register the service worker and reconnect the current session before reopening the editor. ([e015cc7](https://github.com/utaani/unkernel-node-red/commit/e015cc7bba82890cdc0bdf8c373df9b9c3f9f42d))
- Switched both README guides to the Node.js Wisp relay via npx and documented Dashboard 2 installation timing and the demo’s two-minute response limit. ([1420c12](https://github.com/utaani/unkernel-node-red/commit/1420c12ba118c46368f0a275bd0ed4a1d0385361))
- Updated the English and Japanese demo screenshots. ([8842aec](https://github.com/utaani/unkernel-node-red/commit/8842aeca761e14960178e3755a92163a56d18d48))
- Linked to the Wisp protocol specification and relay implementations from both READMEs. ([3dc8770](https://github.com/utaani/unkernel-node-red/commit/3dc8770bb90843212cf6a215956c0118714024b2))
- Reorganized the English and Japanese READMEs and documented browser requirements, the guest terminal, Wisp setup, custom nodes, HTTP In, and FlowFuse Dashboard. ([67d68c1](https://github.com/utaani/unkernel-node-red/commit/67d68c129d150f00b51658659aa2758f2826b5f7))
- Limited npm to four concurrent connections per origin in Wisp sessions to reduce package download timeouts when installing nodes from the palette. ([7223586](https://github.com/utaani/unkernel-node-red/commit/7223586c5c6ef2f0604e0fb55f9f10a322e48697))
- Added an **Open Dashboard** button that opens FlowFuse Dashboard for the current session in a new tab. The Dashboard package needs to be installed in that session. ([8e6b468](https://github.com/utaani/unkernel-node-red/commit/8e6b46884884e5d25fd91c77eed0be92f5e92ddb))
- Expanded the guest data disk from 224 MiB to 512 MiB to make room for additional packages and flows. ([531d990](https://github.com/utaani/unkernel-node-red/commit/531d99023e0b4ad494fc18f53b84cbc7619d7c69))
- Added a guest terminal and a button to reload the Node-RED editor while keeping the guest running. ([23ad1d2](https://github.com/utaani/unkernel-node-red/commit/23ad1d2df28c5fd43d6ca594c04de96e18895016))

## 2026-11-26

- Updated unkernel to `v0.2.0-261126-fd204d3`. ([eca9b33](https://github.com/utaani/unkernel-node-red/commit/eca9b3364ffa72deb92542ca76aca3c140444dd0))
- Localized the startup messages for Japanese and English. ([a6baf23](https://github.com/utaani/unkernel-node-red/commit/a6baf23797d9f1aaec337966d34768731559a476))

## 2026-11-20

- Upgraded the demo to AArch64 unkernel v0.2 and added the optional `?wisp=` parameter for guest network access through a Wisp relay. ([6a0f6d7](https://github.com/utaani/unkernel-node-red/commit/6a0f6d7f665bfa32f60526c7a0c2b2a666428520))

## 2026-11-19

- Enabled offline custom node uploads and added demo-specific Node-RED settings. ([29be110](https://github.com/utaani/unkernel-node-red/commit/29be1101ee45b337839359273a8af3f4ea329577))
- Published the initial browser demo. ([da9b1b5](https://github.com/utaani/unkernel-node-red/commit/da9b1b5c9253840b8697a3805077b3f6f0984159))
