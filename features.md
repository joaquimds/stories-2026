# Features

What was built after the rebuild, what is left for later, and what was
decided against.

## Built

### Finding stories

- **Recent** (`/recent`, in the navbar): the newest sentences anywhere on the
  site, each with the sentence it follows, its author and date. **Loose
  ends** shows sentences nothing follows yet, also newest first (oldest
  first would fill up with endings nobody wants to continue). A separate "needs a continuation" page was dropped: early on
  it would nearly match Recent.
- **Random story** (`/random`, linked from the home page and every tale's
  end): walks from the root choosing a random continuation at each step.
  Loops are followed, but each link at most once, so the walk always ends.

### Reading

- **Fork icons**: a faint path icon in the margin beside sentences that have
  alternatives (other continuations of the sentence before). Clicking it
  lists up to five, each opening that version of the story, with a link to
  all of them. Counts printed inline were rejected as breaking up the prose,
  and the actions row is unchanged. The opening sentence has none.
- **Map** (`/map/<story>`, reached by the "(map)" tab at the foot of the
  book, over the fold, and left by the "(story)" tab in the same place on the
  map; both share the `.book-tab` style): the graph around a story,
  one dot per sentence and a line per link with an arrowhead where it
  arrives (one line with an arrowhead at each end when two sentences link
  each other), so loops show as lines leading back to a dot
  already there. It loads the story's last few sentences, the branches
  leaving them and a few levels ahead, ranked as on the story page, plus
  every sentence leading into the current one (one level back, the story's
  previous sentence first, then by when they were linked), and
  grows as you explore: clicking a dot (or a second tap; Enter from the
  keyboard) moves along the map, adding what lies beyond without
  rebuilding it, and the camera glides there. The earliest of the story's
  sentences shown is blue until the map reaches the beginning (the root,
  green); moving there, like moving anywhere, loads what leads into it.
  Endings
  are red, outlined off the story. Pointing at a dot (or a first tap, or
  focus) shows its sentence in a popover, whose text opens a story: the
  current one up to that sentence if it is on it, the current one
  followed on if it continues it, otherwise the story it was written in.
  "+N" counts continuations not loaded yet. Laid out live by d3-force:
  springs along links, dots pushed apart, a gentle pull to the middle;
  new dots start beside their neighbours and placed ones stay put. Drag to
  pan, scroll or buttons to zoom. How to read it is in the FAQ rather than
  on the page.
- **Share images** (`/og/<story>`): each story's link preview shows its title
  and opening in EB Garamond. The SVG is laid out by hand, wrapping text
  with glyph widths read from the font file, and drawn to PNG by resvg, the
  only image dependency.

### Writing

- **Writing without an account**: the Write box works when logged out.
  "Login to publish" keeps the draft in the browser and returns to the story
  after logging in or registering, with the draft ready to submit. Drafts
  are kept per story while typing.

### Writers

- **Author pages** (`/w/<pen name>`): when a writer started, how much they've
  written, and tabs for their fragments, titled stories and favourites.
  Names in story bylines and on the Recent page link to them.
- **Credit in the digest**: writers also hear when someone else favourites or
  titles a story that passes through their sentences.

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
  [tree@joaqu.im](mailto:tree@joaqu.im) for queries and deletion
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
