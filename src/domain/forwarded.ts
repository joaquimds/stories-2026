// The client address from an X-Forwarded-For header. Each proxy adds the
// address it received the request from to the end, and anything before
// that came from the client, which could have written it. So the last
// entry is the only one a client can't forge.
export const lastForwardedFor = (header: string | null | undefined) =>
  header
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1)
