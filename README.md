# website
Static assets for the Casellas-Maknikar website.

## Context menu

`src/context-menu.js` installs the page context menu without a playground, text pad, or demo controls. The repository's `index.html` loads it directly, and `src/main.js` imports it alongside the existing Hashium import. Repeated initialization does not add another menu.

To use the menu on another page, serve `src/context-menu.js`, `src/context-menu.css`, and `src/fonts/` together and include:

```html
<script type="module" src="/src/context-menu.js"></script>
```

The stylesheet resolves relative to the module URL and the font resolves relative to the stylesheet. Keep those paths together when hosting through a CDN. Cross-origin module hosting requires appropriate CORS headers; any page content security policy must allow these assets. The module preserves native context menus until its stylesheet loads successfully. There is no build step or runtime library dependency for the menu itself.

### Behavior

- Right-click ordinary page content, or use Shift+F10 / the Context Menu key. About opens only by clicking or pressing Enter, Space, or Right. Its submenu stays open while the pointer crosses between panels; narrow screens show a Back action.
- Arrow keys, Home, End, type-ahead, Escape, and Tab support keyboard navigation. Command shortcuts apply while the menu has focus. Outside clicks, page scrolling, resizing, or window blur dismiss it.
- Inputs, editable regions, buttons, links, images, media, dialogs, and elements marked `data-native-context-menu` retain native handling. Existing `preventDefault()` handlers are respected. Touch long-press and Shift+right-click also bypass the menu.
- **Use browser menu** allows the next genuine right-click or keyboard invocation through, then restores the custom menu. Right-clicking that action opens the browser menu immediately.
- **Copy** uses the page text selected when the menu opened. **Select all** selects page content while excluding the menu UI. Editing controls retain their own cut, copy, and paste behavior.
- Page actions include navigation, reload, copy URL, printing the page, a screenshot picker, and source/element-detail viewers. Source content is displayed as text. The element-detail viewer shows markup and selected computed properties; full developer tools remain available through browser shortcuts. History direction cannot be determined precisely by page scripts, so Back/Forward use the available history length and may have no destination.
- **About → Email address** copies `contact@casellas-maknikar.com`. **About → Mailing address** copies these three lines:

```text
Casellas-Maknikar
971 US Highway 202 N, Suite N
Branchburg, Somerset County, NJ 08876, US
```

Change actions in `menuItems` and contact information in `contactDetails` in `src/context-menu.js`. Styling is scoped to `#cm-menu-host`, supports the system color scheme, reduced motion and forced colors, and hides only the injected UI during printing. The bundled Cinzel Decorative font is licensed under the [SIL Open Font License](src/fonts/OFL.txt).

Clipboard and screen capture depend on browser support, a secure context, and user permission. Unavailable actions are disabled and rejected operations report failure. Screenshot capture uses the browser's chooser and stops the capture tracks after saving or failing. View source fetches the current page URL, with initialization-time markup as a fallback.

### Validation

Run the dependency-free suite with Node.js 22 or later:

```sh
node --test tests/*.test.cjs
```

Tests cover full-module initialization and event routing, native-menu boundaries, clipboard outcomes, keyboard navigation, submenu focus and positioning logic, theme contrast, screen-capture cleanup, and source rendering. DOM fixtures simulate events and dimensions; they do not verify browser rendering or actual permission prompts. Before deploying, check desktop and narrow-screen layout, About pointer/keyboard navigation, native controls, clipboard permission failures, printing, and the screenshot picker in the target browsers.

