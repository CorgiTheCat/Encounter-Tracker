# Release test checklist

Run `npm test` for build/syntax/asset checks, then test in a real Owlbear room:

- Load an existing Scene and confirm saved portraits, Dead states and current round remain intact.
- Close/reopen the extension; test a delayed Scene load, Retry, and changing Scenes.
- Add several selected Tokens; cancel Asset selection without creating a placeholder.
- Change only a tracker portrait; verify the Scene Token image is unchanged.
- Scroll to a later card, edit Initiative, and verify the scroll position remains.
- Open Edit on one account and the Encounter bar on another; neither should force the other's window mode.
- Toggle Player turns as GM; verify Next appears/disappears for a player in both views.
- Confirm players cannot use Clear all combatants. Confirm clearing as GM never deletes Scene Tokens.
- Mark Dead/Revive and verify another account receives the change.
- Follow a Token, an asset-only combatant, then another Token. Test camera follow OFF on another account.
- Check S/M/L and narrow/mobile layouts.

Known considerations: shared room/Scene metadata and concurrent edits need live multiplayer testing. A successful local build does not guarantee every network or multi-user case.
