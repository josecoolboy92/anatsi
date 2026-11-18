# Anatsi – furniture designer & MDF cutting list

Free, open source, no ads, no account, no paywall. It works offline on your phone once it's installed.

**Open the app:** https://josecoolboy92.github.io/anatsi/
**Android app (APK, works offline):** https://josecoolboy92.github.io/anatsi/download/Anatsi-1.1.apk

English and Amharic (አማርኛ): choose on first start, or switch on the home screen or in Settings.

## Room designs
Master bedroom · Kids bedroom (guard rails, loft bed with desk, rounded wardrobes) · Student room · Guest room (guest houses and rentals) · Dormitory (bunk beds, lockers) · Minimalist bedroom (floating platform bed, push-to-open wardrobe) · Small bedroom / studio · Room with a curved wall (units that follow the curve) · Walk-in dressing room for large houses · Living room TV wall. Tick the pieces you want; the room planner places them and checks walkways, sockets and the TV.

## What it does
- **Kitchens:** enter your wall length and it plans the base and wall cabinets around the sink, cooker and fridge. It uses standard sizes (900 worktop, 600 depth, 720 wall cabinets). There's also a *Comfort* option that sizes the worktop and wall cabinets to the cook's height. You can also make single base, wall and tall cabinets.
- **Beds:** single, twin, double, queen, king, and joinable twins that make a king.
  - Headboards come in 900, 1100, 1300 or 1500 height, or a custom size, with an optional padded panel and footboard.
  - Nightstands can go on either side, with an automatic height and a set gap.
  - The bed deck is plywood or board on metal bars, timber battens or slats, with the holder strips included.
- **Cupboards and wardrobes:** open or closed, with sections, shelves, hanging rails and drawers. The app works out the number of doors and the hinge positions and checks that shelves won't sag. Every standard can be adjusted.
- **Colors and finishes**, plus a **3D model** that can explode the parts and open the doors and drawers. Tap any part to see its size.
- **Cut list** grouped by board and color, with cut size versus finished size (thick edge banding is subtracted). It also lists edge banding meters and hardware (hinges, slides, cams, legs, bars). You can send it to the cutting shop on WhatsApp, or export CSV, print/PDF, or part labels.
- **Sheet layouts** in two modes: *Easy cutting* (strips, with saw steps) or *Fewest sheets*. Both handle blade width, edge trim, grain and offcuts.
- **Cost and quote:** your own prices in ETB (or any currency), plus labour and profit, which you can send to the client.

## Run it yourself
It's a static site with no build step. To run it locally: `python3 -m http.server` and open http://localhost:8000.

## Android app
`android/` holds a small native Android app (no extra libraries) that serves the web app from inside the APK, so it needs no internet permission and works fully offline. Build it with the free Android SDK: `ANATSI_KS_PASS=... ./android/build.sh`. Keep the signing key safe: updates must be signed with the same key.
