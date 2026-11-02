A native `<select>` dropdown styled to match Input, used for format ("Physical (ships)" / "Digital / web app access") and linked-product pickers in source admin forms.

```jsx
<Select label="Format" options={[{value:"physical",label:"Physical (ships)"},{value:"digital",label:"Digital / web app access"}]} value={format} onChange={e => setFormat(e.target.value)} />
```

Always paired with a visible label; `hint` renders a small muted line below (e.g. "Only digital products appear here — purchasing this product grants entitlement to this study.").
