Underline tab switcher, verbatim from the "Create manually / Import from document" admin toggle — active tab gets a dark 2px bottom border and darker text, inactive tabs are muted.

```jsx
<Tabs tabs={[{value:"manual",label:"Create manually"},{value:"import",label:"Import from document"}]} active={tab} onChange={setTab} />
```
