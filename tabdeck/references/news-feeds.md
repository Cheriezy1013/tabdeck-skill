# News sources for the top card

Use the keys in `answers.json` → `"news"`. Up to 4; the first one shows by default and the person can switch.

| Key | Source | Good for |
|---|---|---|
| `techcrunch-ai` | TechCrunch AI | AI news, several stories a day (checked working) |
| `mittr-ai` | MIT Technology Review AI | Deeper AI stories (checked working) |
| `verge` | The Verge | Tech and gadgets |
| `ars` | Ars Technica | Tech, science, policy |
| `hackernews` | Hacker News front page | Developers, startups |
| `bbc-world` | BBC News | World news |
| `bbc-business` | BBC Business | Business and markets |
| `sciencedaily` | ScienceDaily | Science discoveries |
| `smashing` | Smashing Magazine | Web and UX design |

Only the first two were checked when TabDeck was made; the others are common public feeds. If a feed doesn't load, TabDeck says so on the card and links to the site, and nothing else breaks.

## The person's own source

Any public RSS or Atom feed works: `{"label": "Mothership", "url": "https://…/feed", "home": "https://…"}`. The url must start with `https://`. Many sites have a feed at `/feed`, `/rss` or `/rss.xml`; if you are not sure of the address, say so and suggest they check it in their browser (it should show a page of XML), or pick one from the table.

The `newsLabel` in answers.json is the card's heading, e.g. `"🤖 AI news today"`, `"💼 Business today"`, `"🎨 Design reads"`.
