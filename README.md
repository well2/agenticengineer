# agenticengineer.cz

Osobní prezentace **Jiřího Studničky** — agentic engineera. Statický web pro GitHub Pages, bez backendu a bez build kroku.

## Koncept

„Sestup do studny" — Studnička = malá studna (GitHub: `well2`), logo je studna s rumpálem. Stránka je vertikální sestup vrstvami praxe: hloubkoměr na levém okraji měří −0 až −42 m, dole je voda (kontakt). Nástroje pojmenované podle kovárny (Anvil → Forge → Temper) dostaly sekci Kovárna.

## Stack

- Čisté HTML + CSS + vanilla JS — žádný framework, žádný build.
- Typografie: Fraunces (display) + IBM Plex Sans/Mono, self-hostované woff2 (žádné třetí strany, GDPR friendly).
- Animace: CSS keyframes + IntersectionObserver, respektuje `prefers-reduced-motion`; obsah je viditelný i bez JS.
- Dvojjazyčně: čeština (výchozí, `/`) + angličtina (`/en/`), provázané přes hreflang.

## Struktura

```
index.html      česká verze (výchozí)
en/index.html   anglická verze
404.html        suchá studna
css/            fonts · tokens · layout · components · motion
js/main.js      scroll reveal, hloubkoměr, navigace, marquee pauza, uhlíky
assets/         favicon, og obrázek, fonty
```

## Deploy

GitHub Pages z větve `main` (root). Doména `agenticengineer.cz` přes `CNAME`, `.nojekyll` vypíná Jekyll.
