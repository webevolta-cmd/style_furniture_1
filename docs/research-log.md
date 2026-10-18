# Research & source log

Accessed **2026-10-16** (re-checked 2026-10-18).

**How the business was identified.** The client brief names the Instagram account
[`@style_furniture_1`](https://www.instagram.com/style_furniture_1/), and this repository is named after
the same handle. The kitchen and clinic photos attached to the brief show the same furniture as the
account's own posts (DdGoN0BOTVl / DdHGy2jAp-j and DdTqhmuALyo), which confirms it's the same business.

## Sources reviewed

| Source | Result |
| --- | --- |
| Instagram profile https://www.instagram.com/style_furniture_1/ (public profile page) and its public embed https://www.instagram.com/style_furniture_1/embed/ | **Accessible.** Name, bio, post count (34), profile picture and the 6 most recent posts with captions were read. |
| https://www.instagram.com/p/DdGoN0BOTVl/ | Caption and cover read: kitchen; quality positioning; orders via Direct. |
| https://www.instagram.com/p/DdHGy2jAp-j/ | Caption and cover read: kitchen; product range. |
| https://www.instagram.com/p/DdHnM6gOBnY/ | Caption and cover read: upholstered bed frame with layered headboard and bouclé bench, installed in an apartment; "made fully to order in your size, colour and fabric". |
| https://www.instagram.com/p/DdHoNROu6ks/ | Caption and cover read: sofa with a fabric sample book. |
| https://www.instagram.com/p/DdTqhmuALyo/ | Caption and cover read: velvet armchairs and sofa in a medical clinic waiting area; product range. |
| https://www.instagram.com/p/DdUsUHcukel/ | Caption and cover read: velvet armchair and rounded sofa (clinic), hashtag `#chestrfield`. |
| Google Maps searches "Style furniture Yerevan", "Style furniture Armenia" and an Armenian-language query for the name | **No listing** for this business. Results such as "Style Studio" (Aleq Manukyan 17) are different companies and were **not** used. |
| Web search, 2026-10-16: Google, Bing and DuckDuckGo for the business name and the phone number | No website, Facebook page, directory listing or reviews found for this business. |
| Web search re-check, 2026-10-18, exact queries: `"style_furniture_1"`, `"033 26 33 66"`, `"Style furniture" Yerevan custom furniture` | Same result. Only unrelated companies appear (e.g. REDLINE on Spyur, Décora on Yandex Maps); none were used. |
| Spyur / 2GIS (via search results) | Only similarly named, unrelated companies (GM Style, Decor Style, Nuri Style, Style Studio). Not used. |

### Not accessible — not reviewed

| Item | Why |
| --- | --- |
| The 28 older posts (34 in total, 6 read) | Instagram shows them only to logged-in users. |
| Comments: 4 on DdHGy2jAp-j, 2 on DdTqhmuALyo, 1 on DdGoN0BOTVl | Comment text requires login. Not read, so no customer feedback is quoted anywhere. |
| Story highlights and stories | Require login. |
| Accounts that appear in the posts (@artmedmrc, @emka__official) | Profiles require login; nothing from them is used. |
| Instagram mirrors (imginn, picuki, dumpor) | Blocked / unavailable from the research environment. |

## Verified facts (published by the business itself)

| Fact | Evidence |
| --- | --- |
| Name: **Style furniture** / Style Furniture | Instagram profile name and logo ("SF" monogram, "STYLE FURNITURE"). |
| Phone for orders: **033 26 33 66** (+374 33 26 33 66) | Instagram bio: "📞 Պատվերներ՝ 033 26 33 66". |
| Tagline: "Style Furniture — հարմարավետություն, որ զգացվում է առաջին իսկ հայացքից" | Instagram bio. |
| "Որակյալ կահույք՝ Ձեր երազանքի դիզայնով" | Instagram bio (used on the site in edited form: "Որակյալ կահույք՝ Ձեր երազած դիզայնով"). |
| Products: kitchens, wardrobes and walk-in closets, upholstered furniture (sofas, armchairs), beds and other furniture, fully made to order | Captions of DdGoN0BOTVl, DdHGy2jAp-j, DdTqhmuALyo. |
| Custom size, colour and fabric | Caption DdHnM6gOBnY ("պատրաստվում է ամբողջությամբ պատվերով՝ ձեր նախընտրած չափսով, գույնով և կտորով"). |
| Quality positioning ("we don't economise on quality; quality materials; attention to every detail; made to last for many years") | Caption DdGoN0BOTVl. |
| Orders via Instagram Direct | Several captions ("Պատվերների և մանրամասների համար գրեք Direct"). |
| Yerevan, Armenia | Hashtags `#erevan`, `#կահույքհայաստանում`; Armenian phone number. No street address is published. |
| Real work shown: layered-headboard bed frame installed in an apartment; velvet armchairs and sofas in a medical clinic waiting area; kitchen; sofa with fabric sample book | Post covers DdHnM6gOBnY, DdTqhmuALyo / DdUsUHcukel, DdGoN0BOTVl / DdHGy2jAp-j, DdHoNROu6ks. |

The Armenian website copy keeps the meaning of the business's captions but is rewritten in standard,
grammatical Eastern Armenian; it does not quote the captions verbatim.

## Client-supplied facts (authoritative, used as provided)

- **Free consultation, free measurement and free installation** (Անվճար խորհրդատվություն, չափագրություն, տեղադրում). No public source contradicts this.
- The business produces **all types of furniture** to custom order — beds, sofas, armchairs, kitchen furniture, wardrobes/cabinets and other furniture — in the customer's **colour, size and model/design**.
- The five attached photos (bedroom, two living rooms, kitchen, clinic armchairs). The kitchen and clinic photos match the business's own Instagram posts.

## Deliberately not published (not verifiable)

- Street address, showroom/workshop location, map pin, opening hours.
- Google rating, reviews or testimonials (none found or accessible) — no testimonials were written.
- Prices, delivery terms, warranty, production timelines, material brands, certifications, years in business.
- The temporary "40% discount" mentioned in one caption (time-limited promotion).
- WhatsApp/Viber/Telegram — not listed by the business, so only phone, SMS and Instagram are offered.

## Unresolved / for the client

- **SMS:** the published number (033 = mobile) can receive SMS, and the site offers SMS as a contact
  method and as a way to send a request when online delivery isn't available. The business publishes
  the number for orders and Instagram Direct for messages; please confirm SMS is read, or remove
  `sms` from `methods` in `src/components/Inquiry.astro` and the SMS button in its fallback block.
- To show a map, opening hours or a showroom address: add the fields to `src/data/business.ts`, render
  them in `src/components/Contact.astro` and add them to the LocalBusiness JSON-LD in
  `src/layouts/Base.astro` (address/openingHours).
- Finish names in the colour selector are illustrative previews (labelled as such); the real fabric
  range is chosen from samples during consultation.
