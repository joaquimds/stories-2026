# Ideas

Suggestions for the site after launch, grouped by what they'd do. Sizes are
rough, given how the app is built now.

## Getting people writing

- **Daily or weekly prompt.** Pin a seeded first line on the home page
  ("This week's beginning…"). It gives newcomers somewhere to start, and
  regulars a reason to come back. _Small: a featured beginning, chosen by
  hand._
- **A Recent page.** The newest sentences anywhere on the site, each opening
  its story. "Newest" today only sorts the continuations of the story you're
  on. It shows the site is alive, gives regulars a feed to check, and
  includes sentences that have already been continued. _Small: one query and
  a page._

  Later, a **"loose ends only" filter** (sentences nothing follows yet) can
  bring stalled stories back, sorted oldest first. A separate "needs a
  continuation" page was considered, but early on it would nearly match
  Recent, since new sentences rarely have continuations yet; it only differs
  once abandoned branches pile up. _Small: one extra condition._

- **Random story button.** It walks a random path from a random beginning to a
  tale's end. It suits the "garden of forking paths" idea. _Small._
- **Writing without an account, held for later.** "Login to contribute" is
  likely the biggest drop-off. Let people type first, then sign up to
  publish, keeping the draft in the browser. _Small to medium._

## Making reading more fun

- **A map of the tree.** A zoomable view of the branches around the current
  story, showing where it forks, where the loops are, and where you are. The
  feature most likely to make the site memorable, and the paths and links
  data already supports it. _Medium to large; best limited to a few levels
  around the current story._
- **Show where the story forks.** At the moment you only see the branches at
  the end of a story, not the alternatives at each sentence along the way.
  Counts printed inline ("Once upon a time (7 branches)…") would break up
  the prose, so keep the text untouched: put a small path icon in the margin
  beside sentences that have alternatives, like a marginal note in a printed
  book, which the eye reads past. Clicking the icon opens the alternatives,
  for signed-in and anonymous readers alike. The sentence's actions row
  stays as it is. Readers who ignore the icons see the story as now. A "show
  forks" toggle was considered, but few readers would find it; the tree map
  could take this over later. _Small to medium._
- **Better link previews when shared.** Use a story's first sentence and
  title in its preview image, rather than the tree for everything. _Medium:
  generating images on the server._
- **"Read as one piece".** A clean, print-friendly view of a story without
  the panels: a nicer version of the existing download, and good for sharing
  finished stories. _Small._

## Recognition and community

- **Author pages.** `/w/<pen name>` with a writer's sentences, titled stories
  and favourites. Pen names are already unique, so this is mostly a page.
  _Small to medium._
- **Credit where it's due.** Tell writers when someone favourites or titles a
  story containing their sentence, not just when someone continues it. This
  could go in the existing daily digest. _Small._
- **Featured stories.** A hand-picked "From the garden" shelf in the library.
  Lighter than full moderation, and it sets the tone. _Small._

## Things that are missing

- **Moderation tools.** Reports are emailed and stored, but there's no way to
  act on them in the app (hide a sentence, suspend an account). The main gap
  before the site grows. _Medium._
- **Email verification.** Anyone can sign up with any address, so digests
  could go to someone who never asked for them. _Small to medium; worth doing
  before digests are switched on._
- **Account deletion and data export.** Expected nowadays, and relevant under
  UK and EU data rules. Needs a decision on sentences other people have built
  on, probably the same "[deleted]" masking. _Medium._
- **A short "how it works" introduction.** The FAQ explains everything, but a
  newcomer on the home page doesn't know what a branch or a link is. A
  dismissable three-line explainer would help. _Small._

## Playful extras

- **Constraint challenges.** Writing games with rules (no letter "e", exactly
  ten words, start with the last word of the previous sentence), shown as
  badges on sentences that meet them. _Medium._
- **Loop of the week.** Loops are the site's oddest feature; highlight one on
  the stats page, linking to a story that runs into itself. _Small._
- **Story length milestones.** Mark the moment a path reaches 10, 50 or 100
  sentences, in the digest and on the story. _Small._

## Suggested order

1. **Email verification**, before turning digests on, to protect the sender's
   reputation with SMTP2GO.
2. **Moderation tools**, at least hiding a reported sentence from the admin
   email with one click.
3. **The Recent page** and **fork icons** in the margin: cheap, and they
   help people find places to write.
4. **The tree map**, as the signature feature once the basics are solid.
