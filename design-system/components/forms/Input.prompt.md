Single-line text field and multi-line textarea, both matching every form field in source (`border rounded-lg p-3`, dark focus ring, red inline error text).

```jsx
<Input label="Title" id="title" required value={title} onChange={e => setTitle(e.target.value)} />
<Input label="Alt text" required error="Alt text is required whenever an image is attached (WCAG 1.1.1)." />
<Textarea label="Description" rows={4} value={desc} onChange={e => setDesc(e.target.value)} />
```

Every source form (`ProductForm`, `StudyForm`, `BlockEditor`) pairs a visible `<label>` with an explicit `id`/`htmlFor` — never a placeholder-only field. `required` fields that also gate submission show a red inline `error` string, not a browser-native validation bubble.
