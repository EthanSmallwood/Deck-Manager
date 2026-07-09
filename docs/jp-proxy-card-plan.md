# JP Proxy Card Plan

Goal: generate a single translated proxy image from a JP Weiss card, then later reuse that renderer during TTS export.

## First UI Spike

- Add the action from the card details modal.
- The button should generate one card only, using the selected card's current translated deck data.
- Keep this as a one-card preview before changing full-deck TTS export.

The details modal already has a disabled `Generate Proxy` button for translated JP Weiss cards as the landing spot.

## Renderer Shape

Use the JP card image as the base image and bake English text on top.

Suggested layout:

- Rules text: white box over the JP rules area.
- Name: translated name over the bottom name strip.
- Traits: translated traits over the trait boxes.
- Keep original art, level, cost, power, soul, trigger, color, and frame.

## Output

Write generated images under an ignored cache folder, for example:

`outputs/proxies/weiss-jp/<card-number>.png`

The card can then point its TTS image URL at the generated proxy image when proxy mode is enabled.

## Open Questions

- Pick rendering tech: SVG-to-PNG, HTML screenshot, or a native image library.
- Decide whether proxy generation should be manual per card, per deck, or automatic during TTS export.
- Add manual text fitting rules for long ability text.
- Decide whether to use saved translation cache corrections before generating proxies.
