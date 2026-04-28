## Make the greeting bigger

The "Hi <Name>" line in the header is currently `text-[10px]` muted — too small to notice. Bump it up so it reads as a proper greeting next to the app title.

### Change

In `src/components/AppShell.tsx` (header block, lines ~114–123):

- Title `📦 POSM Tracker`: `text-sm` → `text-base`
- Greeting line: `text-[10px] font-medium text-muted-foreground` → `text-sm font-semibold text-foreground/80`
- Add `leading-tight` on the wrapping column so the two lines stack neatly without extra vertical space.

Result: title and greeting are both clearly legible, greeting sits right under the title with good hierarchy, header height stays compact.

No other files affected.