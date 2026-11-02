Primary call-to-action button, used for the single dominant action per screen ("Save product", "Proceed to payment", "Send login link").

```jsx
<Button onClick={save}>Save product</Button>
<Button variant="secondary">Cancel</Button>
<Button disabled>Saving...</Button>
```

Variants: `primary` (solid ink, the only variant seen in source — used for every primary action), `secondary`/`ghost`/`danger` (intentional additions for common secondary/destructive actions not present verbatim in source, styled to match). Sizes: `md` (default, `p-3`/`px-6 py-3`), `sm` (`px-4 py-2`). `disabled` drops opacity to 50% and blocks the pointer, matching every disabled button in source.
