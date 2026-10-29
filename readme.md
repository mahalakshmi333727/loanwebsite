# Renoahbusinesshub — Insurance Website

A responsive, single-page static website (plain HTML, CSS and JavaScript) for
Renoahbusinesshub, an insurance advisory office in Madurai covering life, term,
health, motor, general and business insurance. It keeps the original "bond
paper" design, header, cards, animations and the Three.js hero document.

No build step, no npm, no framework. Any static host works.

## Technology

- HTML, CSS, JavaScript (no framework)
- Three.js r128 from cdnjs (hero document and other 3D effects)
- Courier Prime from Google Fonts
- Web3Forms for the quote pop-up form (key still to be added)

## Folder structure

```
renoahhweb/
├── index.html
├── 404.html                  custom "Page Not Found" (noindex)
├── 403.html                  custom "Access Denied" (noindex)
├── cookie-policy.html        standalone Cookie Policy page
├── robots.txt
├── sitemap.xml               homepage URL
├── sitemap-images.xml        indexable photos
├── site.webmanifest          web app manifest
├── .htaccess                 Apache / Hostinger settings
├── favicon.ico               16, 32 and 48 px
├── README.md
├── css/
│   ├── paper-theme.css       palette tokens, paper texture, document frame
│   ├── style.css             layout and every section component
│   ├── responsive.css        breakpoints, mobile navigation
│   ├── refine.css            final presentation layer (loads last)
│   └── utility-pages.css     small additions for 404, 403 and cookie policy
├── js/
│   ├── main.js               start-up, mobile menu, Three.js scenes, image fallback
│   ├── interactions.js       forms, calculators, WhatsApp links, FAQ, scroll effects
│   └── three-scene.js        Three.js artwork
└── assets/
    ├── icons/                favicon-16x16.png, favicon-32x32.png,
    │                         android-chrome-192x192.png, android-chrome-512x512.png,
    │                         apple-touch-icon.png (180 x 180)
    └── images/               photos, og-banner.png (1200 x 630 social preview),
                              og-banner.svg and other SVG artwork
```

## SEO files

| File | Purpose |
|---|---|
| `sitemap.xml` | Lists the canonical homepage. Error pages are not listed. No `lastmod` is set because no real edit date is tracked; add one when you publish. |
| `sitemap-images.xml` | The six local photos used on the page. |
| `robots.txt` | Allows everything (CSS, JS and images included) and points to both sitemaps. |
| `site.webmanifest` | Name, colours (paper theme), start URL and icons. |
| `.htaccess` | Custom 403/404, HTTPS redirect, compression, caching, MIME types, basic security headers. |
| `404.html`, `403.html` | Branded error pages with `noindex, follow`. |
| `cookie-policy.html` | Describes only the technologies the site really uses (no analytics or advertising). Linked from the footer. |

`index.html` contains the title, meta description, canonical, Open Graph, Twitter
card and JSON-LD (InsuranceAgency/Organization, WebSite, WebPage, FAQPage). The
FAQ schema mirrors the 12 visible FAQ answers; if you edit a visible FAQ,
update the JSON-LD block to match.

## Favicon files

`favicon.ico`, `favicon-16x16.png`,
`favicon-32x32.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png` and
`apple-touch-icon.png`, all made from the Renoah Business Hub shield logo.

## Replace the domain placeholder (required)

The real domain was not found anywhere in the project. Every SEO URL uses this
one placeholder:

```
https://YOUR-REAL-DOMAIN.COM
```

Replace it in: `index.html` (canonical, `og:url`, `og:image`, `twitter:image`,
JSON-LD), `cookie-policy.html` (canonical), `robots.txt`, `sitemap.xml` and
`sitemap-images.xml`. On Linux or macOS, from the project folder:

```
grep -rl "YOUR-REAL-DOMAIN.COM" . | xargs sed -i 's#https://YOUR-REAL-DOMAIN.COM#https://www.your-actual-domain.in#g'
```

Then run `grep -r "YOUR-REAL-DOMAIN" .` and confirm nothing is left. Use the
same form (with or without `www`) everywhere.

## Deployment (Apache / Hostinger)

1. In hPanel open File Manager and go to `public_html`.
2. Upload the **contents** of `renoahhweb/` (not the folder itself) so that
   `index.html`, `.htaccess`, `robots.txt` and the `css`, `js`, `assets` folders
   sit directly in `public_html`. Turn on "show hidden files" to see `.htaccess`.
3. Activate the free SSL certificate before relying on the HTTPS redirect.
4. The site must be served from the domain root because 404/403 pages, icons and
   the manifest use root-relative paths such as `/css/style.css`.

## SEO launch checklist

- [ ] Replace the domain placeholder everywhere (section above)
- [ ] Replace `YOUR_WEB3FORMS_ACCESS_KEY` in the quote pop-up form
- [ ] Replace sample testimonials and any remaining `[Advisor Name]` /
      `[Years of experience]` / `[Client Business Hours]` placeholders with real details
- [ ] Add the four missing photos (or accept the Unsplash fallback)
- [ ] Submit `sitemap.xml` and `sitemap-images.xml` in Google Search Console
- [ ] Open `/robots.txt` and `/sitemap.xml` in a browser
- [ ] Check the canonical tag with "View page source"
- [ ] Test the favicon, the Apple touch icon and `/site.webmanifest`
- [ ] Test the social preview (Facebook Sharing Debugger, LinkedIn Post Inspector)
- [ ] Test structured data with Google's Rich Results Test
- [ ] Open a non-existent URL to test the 404 page, and a forbidden folder (for example `/css/`) to test the 403 page
- [ ] Test on a phone: menu, forms, buttons, no sideways scrolling
- [ ] Test every form, internal link and image
- [ ] Check HTTPS works for both the `www` and non-`www` address

These changes make the site technically ready and semantically optimised for
relevant searches. They do not guarantee any ranking or indexing time.

## Page sections (in order)

Hero · Quick consultation · Insurance solutions · Life · Health · General ·
Motor · Business · Insurance review · How it works · Calculators · Why choose
us · About the advisor · Request a callback · FAQ · Final CTA · Contact
(call / WhatsApp / visit, map, main enquiry form) · Legal information · Footer.

Section ids: `home, consultation, solutions, life, health, general, motor,
business, review, how, calculators, why, about, callback, faq, final-cta,
contact, legal`.

**Keep these `data-3d-stage` attributes** (`hero`, `intro`, `services`, `how`,
`trust`, `cta`): the Three.js hero document uses them to follow the page as it
scrolls. They sit on `#home`, `#consultation`, `#solutions`, `#how`, `#why`
and `#final-cta`.

## Contact details used in SEO data

Name, address, phone and e-mail in the JSON-LD, the Contact section and the
Cookie Policy all come from details already in the project: 1st Floor, SS Tower,
Bye Pass Road, Ponmeni, Madurai - 625016; phone 6379367901 (also 9787222421 and
8754797754 on the page); renoahbusinesshub@gmail.com; WhatsApp wa.me/916379367901.
Keep these identical everywhere if anything changes. No ratings, reviews,
opening hours, registration numbers or insurer names are in the structured data
because none of them are verified in the project.

## Forms

- The three on-page forms (quick consultation, callback, main enquiry) are
  validated by `initLeadForms()` in `js/interactions.js` but **do not send data
  anywhere yet**.
- The "Get a Quote" pop-up form posts to Web3Forms. Its hidden field
  `access_key` is still the placeholder `YOUR_WEB3FORMS_ACCESS_KEY` in
  `index.html`. Replace it with the real key from web3forms.com, otherwise quote
  requests will fail. Do not publish any other secrets in the HTML.
- Never add OTP, password, PIN or banking fields.

## Calculators

Five illustrative calculators in one tabbed container (`initCalculators()` and
`initCalculatorTabs()` in `js/interactions.js`). Every result carries the note
"Illustrative only. Actual premiums, benefits and eligibility are subject to
insurer terms, underwriting and policy conditions."

## Images and accessibility

Photos live in `assets/images/` and were compressed to about 1200 px wide.
Six local photos are used: `life-insurance-family.jpg`,
`term-insurance-father-child.jpg`, `health-insurance-doctor.jpg`,
`motor-insurance-car.jpg`, `two-wheeler-insurance-scooter.jpg`,
`business-insurance-store.jpg`. Their `alt` text describes the real photo.

Four slots (child education, retirement, travel, home) still point to local
files that are **not in the project** (`child-education-planning.jpg`,
`retirement-planning-couple.jpg`, `travel-insurance-airport.jpg`,
`home-insurance-family-house.jpg`). Until they are added, `initImageFallbacks()`
in `js/main.js` loads the Unsplash copy named in `data-fallback-src`. To
self-host them, save each photo under that exact name in `assets/images/`
(about 1200 px wide, under 250 KB). Then add them to `sitemap-images.xml`.

## Testimonials

The Testimonials section is labelled as sample content in the page. Replace it
with real, permitted customer testimonials before launch. It is deliberately
**not** marked up as review or rating schema.

## Running locally

```
python3 -m http.server 8080
```

Open `http://localhost:8080/index.html`. The page loads Three.js (r128) from
cdnjs and Courier Prime from Google Fonts; if either is blocked the static
paper fallback and system monospace font are shown instead.

## Code conventions

- No inline CSS (`style=`) and no inline JavaScript (`on*=` handlers or
  `<script>` blocks) in the HTML.
- Every major section of the HTML, CSS and JavaScript starts with a banner
  comment.
- Content shown before JavaScript runs: the scroll-reveal fade is switched off
  for visitors with scripting disabled by a `@media (scripting: none)` rule in
  `css/style.css`.
