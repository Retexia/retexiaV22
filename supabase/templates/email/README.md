# Supabase Auth email templates

Paste each file into **Supabase → Authentication → Email Templates** (Source/HTML view) with its subject.

| Template | Subject | File |
|---|---|---|
| Confirm signup | Confirm your email for Retexia | `confirm-signup.html` |
| Magic Link | Your Retexia sign-in link | `magic-link.html` |
| Reset Password | Reset your Retexia password | `reset-password.html` |
| Change Email Address | Confirm your new email for Retexia | `change-email.html` |
| Invite user | You're invited to Retexia | `invite-user.html` |

Links use `{{ .RedirectTo }}`: every Retexia app asks Supabase to send people back to its own `/auth/confirm?next=…`, so customers land signed in on the page they came from, and team members land on admin.retexia.com.
