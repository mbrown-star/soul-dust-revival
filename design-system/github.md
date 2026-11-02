repo: mbrown-star/study-platform-scaffold
branch: main
## Last sync
date: 2026-07-29T14:50:37Z
### Updated in this project
- Discovered the source repo now carries a real, live brand: **Soul Dust Revival** (Psalm 119:25 theme) — tailwind tokens `ink #17231f`, `dusk #2a4038`, `parchment #f7f2e6`, `ember #de3a2e`, `gold #f0b93e`, `moss #4b6358`, fonts Fraunces/Source Serif 4/Archivo.
- Replaced the placeholder neutral/amber palette in `tokens/colors.css` and system-font stack in `tokens/typography.css` with these real values; added `tokens/fonts.css` (`@font-face` for Fraunces, Source Serif 4, Archivo).
- Rebuilt `Soul Dust Revival Homepage.html` to match the real `DustHero`/`SiteHeader`/`SiteFooter` components (gold→ember→ink gradient hero with rising dust motes, "Start where you are" product grid, "How a study works" 3-step section, "From the blog" section) instead of the earlier invented sunset-photo hero.
- Confirmed public pages `/`, `/books`, `/books/[slug]`, `/blog`, `/blog/[slug]` are real dynamic pages reading `products`/`posts`, and roles (`admin`/`leader`/`user`), leader resources, and social scheduling exist in source but aren't yet reflected in the UI kits here.

## Screen map
| Screen | Repo source |
|---|---|
| Homepage hero | `components/marketing/DustHero.tsx`, `app/globals.css` (`.dust-mote`/`@keyframes dust-rise`) |
| Site header/footer | `components/marketing/SiteHeader.tsx`, `components/marketing/SiteFooter.tsx`, `components/marketing/CartLink.tsx` |
| Homepage sections | `app/(marketing)/page.tsx` |
| Books catalog | `app/(marketing)/books/page.tsx` |
| Blog index | `app/(marketing)/blog/page.tsx` |
| Login/signup | `components/auth/AuthForm.tsx` |
| Storefront/checkout UI kit | `app/(marketing)/checkout/*`, `components/commerce/AddToCartButton.tsx` (not yet re-styled to real brand — next sync) |
| Admin UI kit | `components/admin/*` (not yet re-styled to real brand — next sync) |
