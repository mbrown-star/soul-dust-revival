The full clickable admin list row — thumbnail, title, meta line — with a `hover:bg-neutral-50` background, used for product and study lists.

```jsx
<ProductRow imageUrl={p.imageUrl} title={p.title} meta={`${p.format} · $${(p.priceCents/100).toFixed(2)}`} href={`/admin/products/${p.id}`} />
```
