import { env } from '../env.ts'

export type Email = {
  to: string
  subject: string
  text: string
  html: string
}

// Render's free tier blocks outbound SMTP, so mail goes over HTTPS
export const sendEmail = async (email: Email) => {
  const { SMTP2GO_API_KEY, EMAIL_FROM } = env()
  if (!SMTP2GO_API_KEY) {
    console.info(`Email to ${email.to}: ${email.subject}\n${email.text}`)
    return
  }
  const response = await fetch('https://api.smtp2go.com/v3/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Smtp2go-Api-Key': SMTP2GO_API_KEY,
    },
    body: JSON.stringify({
      sender: `Tree of Tales <${EMAIL_FROM}>`,
      to: [email.to],
      subject: email.subject,
      text_body: email.text,
      html_body: email.html,
    }),
  })
  if (!response.ok) {
    throw new Error(
      `SMTP2GO responded ${response.status}: ${await response.text()}`,
    )
  }
}
