---
title: Encounter Tracker
description: A fantasy-themed initiative tracker with shared rounds, custom portraits, Dead status and optional camera follow.
author: CorgiTheCat
image: https://encounter-tracker-gxvc.onrender.com/logo.png
icon: https://encounter-tracker-gxvc.onrender.com/logo.png
tags:
  - combat
  - tool
manifest: https://encounter-tracker-gxvc.onrender.com/manifest.json
learn-more: https://encounter-tracker-gxvc.onrender.com/guide/
---

# Encounter Tracker

Keep your party's turns in view with a fantasy-themed encounter tracker for Owlbear Rodeo, created by **CorgiTheCat**.

## Features

- Add selected Scene Tokens together using **Add to Encounter**, or add characters from Assets.
- Use full-art portraits in the tracker without replacing Token images on the Scene.
- Share the roster, current turn and round with your party while each person chooses their own Edit or Encounter view.
- Adjust the encounter bar to S, M or L, with the active combatant highlighted.
- Display elapsed encounter time using six seconds per round.
- Mark combatants Dead or Revive them; Dead portraits become grayscale with a DEAD label.
- Let the GM control whether players can advance turns using the **Player turns** switch.
- Toggle camera follow independently for each person. Combatants without a linked Scene Token do not move the camera.

## Getting started

Read the [How to Use guide](https://encounter-tracker-gxvc.onrender.com/guide/) for installation, controls and troubleshooting.

1. Install the extension using the manifest link above and enable it in your Owlbear Rodeo room.
2. Open a Scene, select one or more Tokens, and choose **Add to Encounter** from the context menu. Alternatively, open the tracker and choose **Add from Assets**.
3. Set initiative values and sides, then choose **Sort Initiative**.
4. Choose **Start Encounter** to open the encounter bar. Use **Next** to advance turns if you have permission.
5. Use the eye button to turn camera follow on or off for your own view.

## Saved data and permissions

Encounter information is saved through Owlbear Scene/Room metadata, not in the source repository. Tracker portraits are independent of the linked Scene Token's image. Clearing combatants does not delete Scene Tokens.

Turn permissions are enforced by the extension client, not a separate server security boundary.

## Help and feedback

Report bugs or request improvements through [GitHub Issues](https://github.com/CorgiTheCat/Encounter-Tracker/issues). Include steps to reproduce and your browser/device details. Do not post private room links, credentials or player information.
