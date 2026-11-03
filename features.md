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
  full height like the story's book, with the story's title (if it has one)
  in its top left on white, so the map passes underneath;
  one dot per sentence and a line per link with an arrowhead where it
  arrives (one line with an arrowhead at each end when two sentences link
  each other), so loops show as lines leading back to a dot
  already there. Moving around it is walking, and it is built from the
  story page's own data: each move loads the whole story, from the
  beginning, with the address of each point on it (`getStory`), and the step
  forward (`getChildren`, so ranking and addresses, titles included, are the
  story page's). Nothing leading in is loaded, so everything on the map can
  be walked to from somewhere on the story. Clicking a dot (or a second tap; Enter from the keyboard)
  moves there, adding to the map without rebuilding it, and the camera
  glides there. A dot leads by the shortest walk over the links shown,
  where a step back along the story counts the same as a step forward and
  a tie goes forward (`src/domain/walk.ts`): so one step on round a loop
  beats going back, and one step back beats going round a loop. Walks back
  to a point on the story, or one step on, use the story page's addresses;
  longer ones are written in the browser with the same `encodeThread`, from
  what each fragment was written after. A dot with no walk (only possible if a
  thread can't be written) opens the story it was written in. A popover's
  text opens the same story its dot does. The beginning (the root) is green
  and endings are red, outlined off the story. Pointing at a dot (or a first
  tap, or focus) shows its sentence in a popover. Writing and linking start
  from a + beside where you are, shown while the pointer is over the map (or
  always, on screens without hover), which eases round to face the pointer.
  Clicking it (or Enter) brings out a dashed arrow: landing it on a dot
  links to it (what can't be linked fades: the beginning, what already
  follows, everything when logged out; a touch shows "link here" first),
  and landing it in empty space opens a card to write in there, closed by
  its × or Escape with the draft kept; the new dot starts where the arrow
  landed. Escape or a right click puts the arrow away, and a drag still
  pans. The ringed dot's popover offers delete or unlink by the story page's
  own rules. All of it goes through the story page's server functions and
  writing code (`useWriting`, `useAction`); each moves along the map, and
  after a delete or unlink, what was removed, and anything no longer
  reachable from the beginning, leaves it. A variation on the map
  is a step back, a write and a link. Favourites, titles and reports stay on
  the story page.
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

## To do

Small things noted for later:

- **Cards as whole links.** Cards with fragments on them (the story page's
  continuations, the library and other lists) should be links as a whole,
  not just their sentence: the text no longer underlines on hover, and the
  card itself shows it is hovered or focused and can be clicked.
- **More room for the fork icons.** Slightly more horizontal padding in the
  story view, and the map view to match, so the fork icons aren't cramped.
- **Darker light icons.** The fork icons, and any other very light icons, a
  little darker so they're easy to see; and a review of the theme colours,
  to keep the set minimal.
- **Even spacing in the fork list.** Equal top and bottom margins on the
  list, and no bottom margin on its last item.

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
