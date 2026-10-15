-- =====================================================================
-- 0017: Terms, Privacy and Refund policy aligned with PayHere's requirements
-- (https://support.payhere.lk/policy-samples): the three pages banks check
-- before activating PayHere, covering every point of PayHere's samples for a
-- business that sells online services (nothing is shipped):
--   * Terms: who can use it, orders (and when we refuse one), delivery of the
--     service, payment through PayHere, cancelling, Retexia Post content and
--     approvals, intellectual property, warranties and liability, law, contact.
--   * Privacy: Retexia Post data (Facebook/Instagram access, AI processing),
--     payment data, cookies, service providers, retention, rights.
--   * Refund: eligibility, what isn't refundable, how to ask, processing times.
-- One contact email everywhere (the one on the Contact page). Safe to run again.
-- =====================================================================

update public.page_sections s
   set subtitle = 'Last updated: 14 October 2026',
       content = jsonb_set(s.content, '{body}', to_jsonb($md$These terms apply when you use retexia.com or any Retexia product, such as Retexia Lingo, Retexia Post or a custom project. By creating an account or placing an order, you agree to them. Retexia is a business based in Colombo, Sri Lanka; "we" and "us" mean Retexia.

## Who can use Retexia

You must be at least 18 years old and allowed to act for the business you order for.

## Your account

You need an account to order a product. Give us accurate details, keep your login details safe and tell us straight away if you think someone else has used your account. You are responsible for what happens in your account.

## Orders

When you order a plan, you answer a few questions about your business and then pay. An order is a request to buy: we may contact you with questions, and we can decline or cancel an order, for example if a price on the site was wrong, the service can't be provided for your business, or we suspect fraud. If we do, we refund what you paid in full.

## Delivery of the service

All Retexia products are online services: nothing is shipped. Setup starts as soon as the first payment goes through, and we tell you in your account and by email when your service is ready. Most services are ready within 1 to 3 working days after we have what we need from you (for example, access to your Facebook Page for Retexia Post, or your WhatsApp number for Retexia Lingo).

## Prices and payment

Prices are shown on the pricing page, in the currency stated there. Payments are processed securely by PayHere (PayHere (Private) Limited, Sri Lanka); we never see or store your full card details. By paying, you allow us to charge the price of your plan through PayHere. Monthly plans renew every month and yearly plans every year until you cancel. A setup fee, where a plan has one, is paid once with the first payment. Fees charged by third parties, such as Meta for WhatsApp messages, are billed at cost. Promotional prices are valid only for the period stated. We will tell you at least 30 days before we change the price of an active plan.

## Cancelling

You can cancel any time from your account: open the request and press Cancel subscription. Your plan keeps running until the end of the period you paid for and is not renewed after that. Refunds are covered by our [refund policy](/refund-policy).

## Retexia Post: your posts and your approval

Retexia Post writes captions and designs pictures with AI, using only the business details, products and prices you give us, and publishes them to the Facebook Page and Instagram account you connect. You can see, change, redo or delete every post, and you can switch automatic publishing off so that nothing goes out without your approval. AI can make mistakes, especially in text on pictures, so please check your posts. You are responsible for the content published on your accounts and for having the right to the products, photos and logos you give us. You give us access to your Page through Facebook's own Page access settings and can remove it at any time; posting then stops.

## Using the products fairly

You agree not to use Retexia products to send spam, to mislead people, or to break the law or WhatsApp's and Meta's rules. We may pause a service that is used this way.

## Your content

You keep ownership of your business information, product lists, photos and messages. You allow us to use them only to provide the service to you. The posts and designs made for you are yours to use for your business.

## Our content and software

The Retexia website, software, templates, names and logos belong to Retexia. You may not copy, resell or reverse engineer them.

## Availability

We work hard to keep every product running, but we cannot promise it will never be interrupted, for example when WhatsApp, Facebook, Instagram or another provider has a problem. We will tell you about planned maintenance in advance.

## Limits of our responsibility

The services are provided as they are and as available. As far as the law allows, our total responsibility to you is limited to the amount you paid us in the three months before the problem happened. We are not responsible for lost profits or indirect losses.

## Changes to these terms

We may update these terms. If a change matters, we will tell you by email or on this page before it takes effect.

## Law

These terms are governed by the laws of Sri Lanka.

## Contact

Questions about these terms? Email admin@retexia.com or see our [contact page](/contact).$md$::text))
  from public.pages g
 where g.id = s.page_id and g.slug = 'terms' and s.type = 'rich_text';

update public.page_sections s
   set subtitle = 'Last updated: 14 October 2026',
       content = jsonb_set(s.content, '{body}', to_jsonb($md$This policy explains what information Retexia collects, why we collect it and how we keep it safe. If anything is unclear, email us at admin@retexia.com.

## Who we are

Retexia is a Sri Lankan business, based in Colombo, that sells ready-made digital tools, such as Retexia Lingo and Retexia Post, and builds custom websites, apps and automations. In this policy, "we" and "us" mean Retexia.

## What we collect

- **Account details:** your name, email address and password (stored only in encrypted form).
- **Profile and business details:** phone and WhatsApp numbers, business name, and the answers you give in our order forms.
- **Payment details:** the plan, amounts and dates of your payments. Your card details are handled by PayHere; we never see or store your full card number.
- **Messages you send us:** through the contact form, the waitlist, email or WhatsApp.
- **Retexia Lingo:** when Lingo runs on your WhatsApp number, the messages your customers send and the replies are processed so the service can work, and kept for reports and chat history as described in your plan.
- **Retexia Post:** your brand details, logo, products and prices, the posts and pictures made for you, and access to the Facebook Page and Instagram account you connect (the access key is stored encrypted).
- **Basic technical data:** such as browser type and pages visited, to keep the site secure and working.

## How we use it

- To create and manage your account.
- To set up, run and support the products you order, for example to write and design your posts and publish them at your times.
- To reply to your questions and send you updates about your orders and posts, by email or WhatsApp if you turned WhatsApp messages on.
- To take payments and handle refunds.
- To send product news, only if you agreed to it. You can stop these at any time.
- To keep our services secure, prevent fraud and meet legal duties.

We do not sell your information.

## Who helps us run the service

We share only what each provider needs to do its job:

- **Supabase** (database) and **Vercel** (website hosting).
- **PayHere**, a licensed Sri Lankan payment gateway, for payments and refunds.
- **Meta** (WhatsApp, Facebook and Instagram), to send WhatsApp messages and to publish your posts.
- **OpenAI**, to write captions and create pictures for Retexia Post from your business details. We send only the details needed for your posts.
- Our automation server, which carries out these jobs.

Some of these providers may store data outside Sri Lanka. We choose providers with strong security. We may also share information when the law requires it.

## Cookies

We use only essential cookies, to keep you signed in and remember settings such as the colour theme. We do not use advertising cookies. You can block cookies in your browser, but signing in will not work without them.

## How long we keep it

We keep account and order information while your account is open and for as long as the law requires afterwards (for example, for tax records). Chat data for a product is deleted within 90 days after the service ends, unless you ask us to delete it sooner. Facebook and Instagram access for Retexia Post is deleted when you disconnect or the service ends; posts already published stay on your Page unless you delete them.

## Your choices and rights

You can see and update your profile in your account. You can ask us for a copy of your data, to correct it, or to delete it, by emailing admin@retexia.com. We will reply within 30 days.

## Security

We use encrypted connections, encrypted storage for access keys, access controls and row-level security in our database so each customer can only see their own information. No system is perfectly secure, but we work to protect your information and will tell you if a breach affects you.

## Changes

If we change this policy in a way that matters, we will tell you by email or on this page before the change takes effect, and update the date at the top.

## Contact

Retexia, Colombo, Sri Lanka. Email: admin@retexia.com. More ways to reach us are on our [contact page](/contact).$md$::text))
  from public.pages g
 where g.id = s.page_id and g.slug = 'privacy' and s.type = 'rich_text';

update public.page_sections s
   set subtitle = 'Last updated: 14 October 2026',
       content = jsonb_set(s.content, '{body}', to_jsonb($md$We want you to be happy with Retexia. If you are not, this is how refunds work. All Retexia products are online services, so there is nothing to return or ship back.

## 14-day money-back guarantee

If you are not satisfied, ask for a refund within **14 days of your first payment** and we will refund it in full, including any setup fee.

## Renewals

You can ask for a refund of a renewal (monthly or yearly) within **14 days of the renewal date**. Cancel first from your account (Cancel subscription) so the plan is not renewed again.

## If we can't provide the service

If we cancel your order, or your service is down for a long time because of a problem on our side, we refund the affected period in full, whenever it happens.

## What can't be refunded

- Payments older than 14 days, apart from the case above. You can still cancel at any time, so you are not charged again.
- Fees paid to third parties on your behalf, such as Meta's WhatsApp message fees, which we bill at cost.
- Custom projects (websites, apps and automations): work already delivered under your quote. The quote sets out the payment and refund terms for each stage.

## How to ask

Email admin@retexia.com with your request reference (for example PST-2026-0001) and the reason. We reply within 2 working days.

## How refunds are paid

Approved refunds go back to the card you paid with, through PayHere. It usually takes 5 to 10 working days for the money to show, depending on your bank.

## Who processes payments

Payments and refunds are processed securely by PayHere (PayHere (Private) Limited, Sri Lanka).

## Cancelling

You can cancel any time from your account. Your plan keeps running until the end of the period you paid for and is not renewed after that.

## Contact

Questions about a payment or a refund? Email admin@retexia.com or see our [contact page](/contact).$md$::text))
  from public.pages g
 where g.id = s.page_id and g.slug = 'refund-policy' and s.type = 'rich_text';

update public.pages
   set seo_description = 'How refunds work for Retexia plans paid through PayHere: 14-day money-back guarantee, renewals, and how refunds are paid.'
 where slug = 'refund-policy';
update public.pages
   set seo_description = 'The terms for using the Retexia website and services: orders, delivery, payment through PayHere, cancelling and your content.'
 where slug = 'terms';
update public.pages
   set seo_description = 'How Retexia collects, uses and protects your information, including payments, Retexia Post and cookies.'
 where slug = 'privacy';
