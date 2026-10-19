# Bhav Check — coded voice prototype

F2 Home → F3 Listening → F4 Echo → F5 Price, with F4b when speech isn't understood.

## Run
```bash
python -m http.server 5174 --bind 127.0.0.1 --directory "W:/sem7/deep UI/Inclusive UI/prototype"
```
Open http://127.0.0.1:5174 in **Chrome** (speech recognition is Chrome-only). The mic needs localhost or https.

## Use
- **Hold** the mic (or hold Space) and say a crop, optionally with a mandi: "टमाटर नासिक", "लहसुन लासलगांव".
- Tap a crop photo → straight to the price (a tap is unambiguous, so no echo step).
- Speaker icons read things aloud (on-device Hindi voice if installed).

## Privacy
Recognition uses Chrome's built-in engine, which **sends audio to Google**. Fine for demos.
Get consent before testing with farmers — or swap to on-device Vosk (Hindi model) later.

## Files
- `dots.js` — the four dot fields (breath / listen / ring / gather) + tunables at the top
- `app.js` — data, matching, speech, flow; tunables in `VOICE` and `STAGGER`
- `style.css` — tokens match the Figma board (Botânica palette)
