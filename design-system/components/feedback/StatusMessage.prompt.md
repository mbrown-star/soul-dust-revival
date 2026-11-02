Live-region status line for async feedback — "Uploading...", "Saved", "Captions uploaded ✓". Always `role="status" aria-live="polite"` so screen readers hear it without a page reload, matching every async action in source. Renders an empty fixed-height line when idle, so layout doesn't jump when the message appears.

```jsx
<StatusMessage tone="muted">{uploading ? "Uploading..." : ""}</StatusMessage>
<StatusMessage tone="success">Captions uploaded ✓</StatusMessage>
<StatusMessage tone="error">Import failed.</StatusMessage>
```
