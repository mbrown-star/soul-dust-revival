Native checkbox with an adjacent label, used for boolean toggles like "Active (visible for purchase)" and "Published".

```jsx
<Checkbox id="active" label="Active (visible for purchase)" checked={active} onChange={e => setActive(e.target.checked)} />
```
