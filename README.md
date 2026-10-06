# Render Zero

*A gift for the unfinished.*

Render Zero is a WebXR experience set in the holding space where failed and abandoned 3D generations wait to be permanently deleted. You cannot repair them. Instead you give each one a discarded piece it was never made for: a folding fan becomes a phoenix's wing, a door becomes a guardian's arm, a leaf becomes a temple's roof. Every creation you save before its countdown ends turns the grey archive, piece by piece, back into a living world.

**Play in the browser:** https://render-zero.vercel.app (desktop browser, keyboard and mouse; about 57 MB loads on the first visit)

Built for Tripothon S1. Every model was generated with [Tripo](https://www.tripo3d.ai); both worlds were generated with [World Labs Marble](https://www.worldlabs.ai) and the living world is a walkable Gaussian splat. The game is plain [three.js](https://threejs.org) with the [Spark](https://sparkjs.dev) splat renderer: no build step.

## How to play

You stand on a giant stone hand. Three unfinished creations wait on it as white models, each with its own deletion clock. Four discarded pieces float nearby.

| Creation | Clock | Needs | What it becomes |
|---|---|---|---|
| Phoenix | 01:40 | two folding fans | flies on fan wings, trailing embers |
| Guardian | 02:30 | the arched door | patrols with the door as its shield arm |
| Temple | 03:20 | the leaf | lights come on, it lifts off, the leaf roof breathes |

| Desktop | |
|---|---|
| Move | W A S D (Shift = faster) |
| Look | Mouse |
| Pick up a piece | Aim near it (the dot grows), click |
| Give it to a creation | Aim at the creation or its glowing ring and click, or just walk up to it |
| Let go | Q or right-click (a click that misses does nothing) |
| Release the mouse | Esc |

A piece only fits the creation it belongs to. While you hold one, its creation's ring turns gold and gold dust drifts toward it; a wrong creation flashes red. A creation whose clock runs out is deleted for good. One playthrough takes two to four minutes.

**VR:** on a device that can start a VR session, an ENTER VR button appears. Trigger or grip picks up a piece, releasing it at a creation attaches it. Left stick moves, right stick turns.

**Graphics:** the living world is 1.9 million splats. Integrated and phone graphics chips get a 500,000-splat version automatically. Add `?splat=full` or `?splat=low` to the address to choose by hand.

## Run it on your own computer

Windows: double-click `start.bat` (it uses the web server built into Windows, nothing to install).
macOS / Linux: `python3 tools/serve.py`, then open `http://localhost:8123`.

The page has to be served: opening `index.html` straight from the folder does not work, because browsers block loading models from a file path.

## What is in here

- `index.html`, `main.js` — the whole game. The tables at the top of `main.js` set positions, clocks, sockets, the hand (`HAND`) and the splat world (`WORLD`).
- `assets/models/` — the Tripo models (textures reduced to 2K with `tools/shrink_glb.py`).
- `assets/world_*.spz`, `world_collider.glb`, `pano_*.jpg` — the World Labs worlds.
- `lib180/` — three.js r180 and Spark, so nothing is fetched from a CDN.
- `tools/director.js`, `tools/record_server.py` — render the walkthrough video frame by frame. `tools/board.js` builds the visual asset board.

## Credits

Concept, direction and models: [Yawenjenny](https://github.com/Yawenjenny). Models generated with Tripo. Worlds generated with World Labs Marble. Code written with Claude Code. Sound is generated in the browser with the Web Audio API.
