# Comic Sans Font Setup

## Quick Setup

To add Comic Sans to your app:

1. **Download a Comic Sans font file**:
   - Option A: Download "Comic Neue" from Google Fonts (free alternative)
   - Option B: If you have Comic Sans MS legally available, use that
   - Option C: Search for "comic sans alternative free font"

2. **Add the font file**:
   - Rename your font file to `ComicSans.ttf`
   - Place it in: `assets/fonts/ComicSans.ttf`

3. **Enable font loading**:
   - Open `src/hooks/useFonts.js`
   - Uncomment the line: `'ComicSans': require('../../assets/fonts/ComicSans.ttf'),`
   - Change `return true;` to `return fontsLoaded;`

4. **Update theme**:
   - In `src/theme/themes.js`, change `main: "Comic Sans MS"` to `main: "ComicSans"`

## Current Status

✅ Font loading infrastructure set up
✅ App.js configured to wait for fonts
✅ Theme ready to use Comic Sans
⏳ Waiting for actual font file

The app currently falls back to system fonts but is ready for Comic Sans once you add the font file!