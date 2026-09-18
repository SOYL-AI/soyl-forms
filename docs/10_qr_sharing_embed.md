# QR, Sharing and Embed Specification

## 1. Canonical form URL

Each published form has a stable URL:
`https://{PUBLIC_DOMAIN}/f/{slug}`

Slug must be unique and editable only with clear redirect/breakage behavior. For V1, prefer keeping generated slugs stable and allow cosmetic slug editing carefully.

## 2. Share panel

After publish and from dashboard, provide:
- Copy link
- QR code
- Embed
- open form in new tab

## 3. QR generation

QR destination:
`https://{PUBLIC_DOMAIN}/f/{slug}?src=qr`

The query parameter is analytics metadata only.

Requirements:
- client or server generated using a maintained QR library
- error correction suitable for normal print/digital use
- downloadable PNG
- SVG if library supports safely
- preview with sufficient quiet zone
- minimum visual size guidance
- test dark-on-light by default

Do not put sensitive tokens in QR codes.

## 4. QR branding

Free:
- standard QR

Paid later:
- optional accent color/logo center if scan reliability remains acceptable

Always maintain a high-contrast fallback.

## 5. Embedding

V1 embed:
```html
<iframe
  src="https://example.com/f/slug?embed=1"
  width="100%"
  height="640"
  frameborder="0"
  loading="lazy"
></iframe>
```

Embed mode:
- hides unnecessary outer page chrome
- maintains form functionality
- supports responsive width

Later:
- small JS embed that auto-resizes iframe using `postMessage`
- popup button/embed

## 6. Security for embed

Configure CSP `frame-ancestors` so public forms may be embedded according to product policy. Dashboard/admin routes must not be embeddable.

Validate `postMessage` origins if dynamic resizing is added.

## 7. Link previews

Published forms should have OpenGraph metadata:
- title
- description
- generic/product image or form-specific image later

Do not expose respondent data.

## 8. Source tracking

Capture allowed query values such as:
- `src`
- UTM parameters
- creator-defined hidden fields

Store them in `hidden_fields`/analytics metadata with length/count limits.
