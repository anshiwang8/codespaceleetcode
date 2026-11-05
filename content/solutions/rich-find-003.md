# rich-find-003: Output without escape codes

**Answer:** `rich/_windows_renderer.py`, which defines `legacy_windows_render`.

## How a strong engineer gets there

1. Start where the prompt points: `Console._write_buffer` in `rich/console.py` (line 2059).
2. Inside the `if WINDOWS:` branch, a flag chooses between two paths. When `self.legacy_windows` is true and the output file is one of the standard streams, it takes the legacy path and imports what it needs on the spot:

   ```python
   # rich/console.py, lines 2083-2091
   if use_legacy_windows_render:
       from rich._win32_console import LegacyWindowsTerm
       from rich._windows_renderer import legacy_windows_render

       buffer = self._buffer[:]
       if self.no_color and self._color_system:
           buffer = list(Segment.remove_color(buffer))

       legacy_windows_render(buffer, LegacyWindowsTerm(self.file))
   ```

3. Two files are imported here, so check which one holds the Segment-walking function. `legacy_windows_render` comes from `rich/_windows_renderer.py`. Open it: the function loops `for text, style, control in buffer:`, calls `term.write_styled` or `term.write_text` for ordinary segments, and maps each control code (cursor moves, carriage return, home, and so on) to a method on `term`.

## Why the other files are wrong

- **`rich/_win32_console.py`** defines `LegacyWindowsTerm`, the terminal object. Its methods wrap the Win32 console API (`SetConsoleTextAttribute`, `SetConsoleCursorPosition` and similar). It is what the renderer *calls*, and the prompt rules it out.
- **`rich/_windows.py`** defines `WindowsConsoleFeatures` and the check for whether the console supports VT sequences and truecolor. That decides *whether* the legacy path can be used, not how Segments are written.
- **`rich/console.py`** holds `_write_buffer` and `_render_buffer`. `_render_buffer` is the other path: it joins Segments into one string of ANSI codes, which is exactly what the legacy path avoids.

## Background

Old Windows consoles, before Windows 10's VT support, don't understand ANSI escape sequences. Rich still models all output as `Segment`s with styles and control codes, and only the last step changes: instead of serializing them to escape codes, it replays them as API calls. Keeping that adapter in its own module, imported lazily inside the method, means other platforms never import the Windows `ctypes` bindings at all.

## Takeaways

- Imports inside a function body are a strong hint of a platform-specific or optional code path. Follow them like any other import.
- When two names come from two files on adjacent lines, check which file defines the function the prompt describes, rather than its collaborator.
