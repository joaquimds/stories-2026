# Feature plan

What to build after launch, and what was decided against. Sizes are rough,
given how the app is built now.

## Planned

### Finding stories

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

### Reading

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
- **A map of the tree.** A zoomable view of the branches around the current
  story, showing where it forks, where the loops are, and where you are. The
  feature most likely to make the site memorable, and the paths and links
  data already supports it. _Medium to large; best limited to a few levels
  around the current story._
- **"Read as one piece".** A clean, print-friendly view of a story without
  the panels: a nicer version of the existing download, and good for sharing
  finished stories. _Small._
- **Better link previews when shared.** Use a story's first sentence and
  title in its preview image, rather than the tree for everything. _Medium:
  generating images on the server._

### Writing

- **Writing without an account, held for later.** "Login to contribute" is
  likely the biggest drop-off. Let people type first, then sign up to
  publish, keeping the draft in the browser. _Small to medium._

### Writers

- **Author pages.** `/w/<pen name>` with a writer's sentences, titled stories
  and favourites. Pen names are already unique, so this is mostly a page.
  _Small to medium._
- **Credit where it's due.** Tell writers when someone favourites or titles a
  story containing their sentence, not just when someone continues it. This
  could go in the existing daily digest. _Small._

### Suggested order

1. **The Recent page**, the **random story button** and **read as one
   piece**: small, and they give readers more ways in.
2. **Fork icons** in the margin and **credit** in the digest.
3. **Author pages** and **writing without an account**.
4. **Better link previews.**
5. **The tree map**, as the signature feature once the rest is in place.

## Not yet

- **Moderation tools.** Reports are emailed and stored, but there's no way to
  act on them in the app (hide a sentence, suspend an account). The main gap
  once the site grows. _Medium._
- **Email verification.** Anyone can sign up with any address, so digests
  could go to someone who never asked for them, which can hurt the sender's
  reputation with SMTP2GO. Worth revisiting if bounces or complaints appear.
  _Small to medium._
- **Account deletion and data export.** Expected nowadays, and relevant under
  UK and EU data rules. Would need a decision on sentences other people have
  built on, probably the same "[deleted]" masking. _Medium._

  Meanwhile, the site directs people to email
  [stories@joaqu.im](mailto:stories@joaqu.im) for queries and deletion
  requests, from the footer's Contact link and an FAQ entry.

## Decided against

- **Daily or weekly prompt.** A pinned first line on the home page.
- **Featured stories.** A hand-picked shelf in the library.
- **A "how it works" introduction** on the home page. Finding your way
  around is part of the experience: the site is for exploring, and the FAQ
  is there for anyone who wants it.
- **Constraint challenges.** Writing games with rules, shown as badges.
- **Loop of the week** on the stats page.
- **Story length milestones** at 10, 50 or 100 sentences.
