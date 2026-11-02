Free-form colored content block for "Key Verse," "Reflection," or "Prayer Prompt" style lesson content — a study author picks any background color per instance (via ColorPicker), not a fixed variant list.

```jsx
<Callout title="Key Verse" color="#fef3c7">
  <p>Lesson body copy goes here.</p>
</Callout>
```

Rendered rich text is sanitized before display in production (source uses DOMPurify) — treat any HTML body as untrusted input.
