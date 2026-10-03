# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin.spec.ts >> website editing >> edit a section on the home page
- Location: e2e/admin.spec.ts:137:7

# Error details

```
TimeoutError: locator.fill: Timeout 15000ms exceeded.
Call log:
  - waiting for getByLabel('Title', { exact: true })

```

# Page snapshot

```yaml
- generic [ref=f1e1]:
  - generic [ref=f1e2]:
    - link "Skip to content" [ref=f1e3] [cursor=pointer]:
      - /url: "#main"
    - complementary [ref=f1e4]:
      - generic [ref=f1e5]:
        - generic [ref=f1e7]:
          - generic [ref=f1e8]: Retexia
          - generic [ref=f1e9]: Admin
        - button "Collapse sidebar" [ref=f1e10] [cursor=pointer]
      - navigation "Admin" [ref=f1e14]:
        - generic [ref=f1e15]:
          - generic [ref=f1e16]:
            - link "Dashboard" [ref=f1e17] [cursor=pointer]:
              - /url: /
            - link "Requests 1 waiting" [ref=f1e25] [cursor=pointer]:
              - /url: /requests
              - generic [ref=f1e30]: Requests
              - generic [ref=f1e31]:
                - text: "1"
                - generic [ref=f1e32]: waiting
            - link "Customers" [ref=f1e33] [cursor=pointer]:
              - /url: /customers
            - link "Payments" [ref=f1e41] [cursor=pointer]:
              - /url: /payments
            - link "Inbox" [ref=f1e46] [cursor=pointer]:
              - /url: /inbox
          - generic [ref=f1e52]:
            - paragraph [ref=f1e53]: Products
            - link "Lingo" [ref=f1e54] [cursor=pointer]:
              - /url: /products/lingo
            - link "Post" [ref=f1e58] [cursor=pointer]:
              - /url: /products/post
            - link "Books" [ref=f1e62] [cursor=pointer]:
              - /url: /products/books
            - link "All products" [ref=f1e66] [cursor=pointer]:
              - /url: /products
          - generic [ref=f1e79]:
            - paragraph [ref=f1e80]: Website
            - link "Pages" [ref=f1e81] [cursor=pointer]:
              - /url: /website/pages
            - link "Navigation" [ref=f1e87] [cursor=pointer]:
              - /url: /website/navigation
            - link "Services" [ref=f1e93] [cursor=pointer]:
              - /url: /website/services
            - link "FAQs" [ref=f1e99] [cursor=pointer]:
              - /url: /website/faqs
            - link "Testimonials" [ref=f1e105] [cursor=pointer]:
              - /url: /website/testimonials
            - link "Media" [ref=f1e111] [cursor=pointer]:
              - /url: /website/media
            - link "Text and labels" [ref=f1e118] [cursor=pointer]:
              - /url: /website/strings
    - generic [ref=f1e123]:
      - banner [ref=f1e124]:
        - generic [ref=f1e125]:
          - button "Search requests, customers… ⌘ K" [ref=f1e126] [cursor=pointer]:
            - generic [ref=f1e130]: Search requests, customers…
            - generic [ref=f1e131]:
              - generic [ref=f1e132]: ⌘
              - generic [ref=f1e133]: K
          - generic [ref=f1e134]:
            - link "View website" [ref=f1e135] [cursor=pointer]:
              - /url: http://localhost:3100
            - button "Notifications" [ref=f1e141] [cursor=pointer]
            - button "System theme. Switch theme" [ref=f1e146] [cursor=pointer]
            - button "Your account" [ref=f1e151] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e152]: EE
      - main [ref=f1e153]:
        - generic [ref=f1e154]:
          - generic [ref=f1e155]:
            - link "Pages" [ref=f1e156] [cursor=pointer]:
              - /url: /website/pages
            - generic [ref=f1e160]:
              - heading "Home" [level=1] [ref=f1e161]
              - generic [ref=f1e162]: Home page
          - generic [ref=f1e163]:
            - generic [ref=f1e164]:
              - generic [ref=f1e165]:
                - generic [ref=f1e166]:
                  - heading "Sections" [level=2] [ref=f1e167]
                  - button "Add" [ref=f1e168] [cursor=pointer]
                - list [ref=f1e170]:
                  - listitem [ref=f1e171]:
                    - generic [ref=f1e172]:
                      - button "Drag to reorder Your business answers by itself" [ref=f1e173]
                      - button "Your business answers by itself Hero" [active] [ref=f1e181] [cursor=pointer]:
                        - generic [ref=f1e184]:
                          - generic [ref=f1e185]: Your business answers by itself
                          - generic [ref=f1e186]: Hero
                      - button "Hide section" [ref=f1e187] [cursor=pointer]
                  - listitem [ref=f1e192]:
                    - generic [ref=f1e193]:
                      - button "Drag to reorder Ready-made tools, set up for you" [ref=f1e194]
                      - 'button "Ready-made tools, set up for you Products · #products" [ref=f1e202] [cursor=pointer]':
                        - generic [ref=f1e213]:
                          - generic [ref=f1e214]: Ready-made tools, set up for you
                          - generic [ref=f1e215]: "Products · #products"
                      - button "Hide section" [ref=f1e216] [cursor=pointer]
                  - listitem [ref=f1e221]:
                    - generic [ref=f1e222]:
                      - button "Drag to reorder Need something made just for you?" [ref=f1e223]
                      - 'button "Need something made just for you? Services · #services" [ref=f1e231] [cursor=pointer]':
                        - generic [ref=f1e235]:
                          - generic [ref=f1e236]: Need something made just for you?
                          - generic [ref=f1e237]: "Services · #services"
                      - button "Hide section" [ref=f1e238] [cursor=pointer]
                  - listitem [ref=f1e243]:
                    - generic [ref=f1e244]:
                      - button "Drag to reorder Three steps, then you relax" [ref=f1e245]
                      - 'button "Three steps, then you relax Steps · #how-we-work" [ref=f1e253] [cursor=pointer]':
                        - generic [ref=f1e257]:
                          - generic [ref=f1e258]: Three steps, then you relax
                          - generic [ref=f1e259]: "Steps · #how-we-work"
                      - button "Hide section" [ref=f1e260] [cursor=pointer]
                  - listitem [ref=f1e265]:
                    - generic [ref=f1e266]:
                      - button "Drag to reorder A Sri Lankan team that hates busywork" [ref=f1e267]
                      - 'button "A Sri Lankan team that hates busywork About · #about" [ref=f1e275] [cursor=pointer]':
                        - generic [ref=f1e278]:
                          - generic [ref=f1e279]: A Sri Lankan team that hates busywork
                          - generic [ref=f1e280]: "About · #about"
                      - button "Hide section" [ref=f1e281] [cursor=pointer]
                  - listitem [ref=f1e286]:
                    - generic [ref=f1e287]:
                      - button "Drag to reorder What business owners say" [ref=f1e288]
                      - button "What business owners say Testimonials" [ref=f1e296] [cursor=pointer]:
                        - generic [ref=f1e300]:
                          - generic [ref=f1e301]: What business owners say
                          - generic [ref=f1e302]: Testimonials
                      - button "Hide section" [ref=f1e303] [cursor=pointer]
                  - listitem [ref=f1e308]:
                    - generic [ref=f1e309]:
                      - button "Drag to reorder Good to know" [ref=f1e310]
                      - 'button "Good to know FAQ · #faq" [ref=f1e318] [cursor=pointer]':
                        - generic [ref=f1e322]:
                          - generic [ref=f1e323]: Good to know
                          - generic [ref=f1e324]: "FAQ · #faq"
                      - button "Hide section" [ref=f1e325] [cursor=pointer]
                  - listitem [ref=f1e330]:
                    - generic [ref=f1e331]:
                      - button "Drag to reorder Ready to stop answering the same questions?" [ref=f1e332]
                      - button "Ready to stop answering the same questions? Call to action" [ref=f1e340] [cursor=pointer]:
                        - generic [ref=f1e344]:
                          - generic [ref=f1e345]: Ready to stop answering the same questions?
                          - generic [ref=f1e346]: Call to action
                      - button "Hide section" [ref=f1e347] [cursor=pointer]
                  - listitem [ref=f1e352]:
                    - generic [ref=f1e353]:
                      - button "Drag to reorder Talk to a real person" [ref=f1e354]
                      - 'button "Talk to a real person Contact · #contact" [ref=f1e362] [cursor=pointer]':
                        - generic [ref=f1e366]:
                          - generic [ref=f1e367]: Talk to a real person
                          - generic [ref=f1e368]: "Contact · #contact"
                      - button "Hide section" [ref=f1e369] [cursor=pointer]
                - status [ref=f1e374]
              - generic [ref=f1e375]:
                - button "Page settings and SEO" [ref=f1e376] [cursor=pointer]
                - button "Preview" [ref=f1e377] [cursor=pointer]
                - link "Open on website" [ref=f1e378] [cursor=pointer]:
                  - /url: http://localhost:3100/
            - generic [ref=f1e384]:
              - generic [ref=f1e385]:
                - generic [ref=f1e386]: Hero
                - generic [ref=f1e388]:
                  - button "Duplicate" [ref=f1e389] [cursor=pointer]
                  - button "Delete" [ref=f1e393] [cursor=pointer]
              - generic [ref=f1e397]:
                - generic [ref=f1e398]:
                  - generic [ref=f1e399]:
                    - text: Small label above the title
                    - generic [ref=f1e400]: (Optional)
                  - textbox "Small label above the title(Optional)" [ref=f1e401]: Simple tools for busy businesses
                - generic [ref=f1e402]:
                  - generic [ref=f1e403]:
                    - text: Link name (#anchor)
                    - generic [ref=f1e404]: (Optional)
                  - paragraph [ref=f1e405]: Lets buttons jump to this section.
                  - textbox "Link name (#anchor)(Optional)" [ref=f1e406]
                - generic [ref=f1e407]:
                  - generic [ref=f1e408]:
                    - text: Title
                    - generic [ref=f1e409]: (Optional)
                  - textbox "Title(Optional)" [ref=f1e410]: Your business answers by itself
                - generic [ref=f1e411]:
                  - generic [ref=f1e412]:
                    - text: Highlighted words
                    - generic [ref=f1e413]: (Optional)
                  - paragraph [ref=f1e414]: Part of the title shown in the accent colour.
                  - textbox "Highlighted words(Optional)" [ref=f1e415]: itself
                - generic [ref=f1e416]:
                  - generic [ref=f1e417]:
                    - text: Background
                    - generic [ref=f1e418]: (Optional)
                  - combobox "Background(Optional)" [ref=f1e420]:
                    - option "Choose one"
                    - option "Plain" [selected]
                    - option "Tinted"
                - generic [ref=f1e421]:
                  - generic [ref=f1e422]:
                    - text: Intro text
                    - generic [ref=f1e423]: (Optional)
                  - textbox "Intro text(Optional)" [ref=f1e424]: "Retexia builds simple tools that take care of the busywork. Start with Retexia Lingo: your WhatsApp replies to customers in seconds, day and night."
              - generic [ref=f1e425]:
                - generic [ref=f1e426]:
                  - heading "Section settings" [level=3] [ref=f1e427]
                  - tablist "Editor mode" [ref=f1e428]:
                    - tab "Form" [selected] [ref=f1e429] [cursor=pointer]
                    - tab "JSON" [ref=f1e430] [cursor=pointer]
                - generic [ref=f1e431]:
                  - group "Main button" [ref=f1e432]:
                    - generic [ref=f1e434]:
                      - switch "Show main button" [checked] [ref=f1e435] [cursor=pointer]
                      - generic [ref=f1e437]: Show main button
                    - generic [ref=f1e439]:
                      - generic [ref=f1e440]:
                        - generic [ref=f1e441]:
                          - text: Text
                          - generic [ref=f1e442]: (Optional)
                        - textbox "Text(Optional)" [ref=f1e443]: See Retexia Lingo
                      - generic [ref=f1e444]:
                        - generic [ref=f1e445]:
                          - text: Link
                          - generic [ref=f1e446]: (Optional)
                        - paragraph [ref=f1e447]: "/contact, #pricing or https://…"
                        - textbox "Link(Optional)" [ref=f1e448]: /lingo
                  - group "Second button" [ref=f1e449]:
                    - generic [ref=f1e451]:
                      - switch "Show second button" [checked] [ref=f1e452] [cursor=pointer]
                      - generic [ref=f1e454]: Show second button
                    - generic [ref=f1e456]:
                      - generic [ref=f1e457]:
                        - generic [ref=f1e458]:
                          - text: Text
                          - generic [ref=f1e459]: (Optional)
                        - textbox "Text(Optional)" [ref=f1e460]: Talk to us
                      - generic [ref=f1e461]:
                        - generic [ref=f1e462]:
                          - text: Link
                          - generic [ref=f1e463]: (Optional)
                        - paragraph [ref=f1e464]: "/contact, #pricing or https://…"
                        - textbox "Link(Optional)" [ref=f1e465]: /contact
                  - generic [ref=f1e466]:
                    - generic [ref=f1e467]:
                      - text: Visual
                      - generic [ref=f1e468]: (Optional)
                    - combobox "Visual(Optional)" [ref=f1e470]:
                      - option "Default"
                      - option "Lingo chat demo" [selected]
                      - option "Chat (written below)"
                      - option "Image"
                      - option "None"
                  - generic [ref=f1e472]:
                    - switch "Soft glow behind the headline" [checked] [ref=f1e473] [cursor=pointer]
                    - generic [ref=f1e475]: Soft glow behind the headline
                  - generic [ref=f1e477]:
                    - generic [ref=f1e478]:
                      - text: Small badge
                      - generic [ref=f1e479]: (Optional)
                    - textbox "Small badge(Optional)" [ref=f1e480]
                  - generic [ref=f1e481]:
                    - generic [ref=f1e482]:
                      - text: Size
                      - generic [ref=f1e483]: (Optional)
                    - combobox "Size(Optional)" [ref=f1e485]:
                      - option "Default"
                      - option "Large" [selected]
                      - option "Compact"
              - generic [ref=f1e486]:
                - generic [ref=f1e487]:
                  - switch "Visible" [checked] [ref=f1e488] [cursor=pointer]
                  - generic [ref=f1e490]: Visible
                - generic [ref=f1e492]:
                  - button "Discard" [disabled]
                  - button "Preview" [ref=f1e493] [cursor=pointer]
                  - button "Save section" [disabled]
  - region "Notifications alt+T"
  - generic [ref=f1e498] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=f1e499]
    - generic [ref=f1e503]:
      - button "Open issues overlay" [ref=f1e504]:
        - generic [ref=f1e505]:
          - generic [aria-hidden] [ref=f1e506]: "14"
          - generic [ref=f1e507]: "15"
        - generic [ref=f1e508]:
          - text: Issue
          - generic [aria-hidden] [ref=f1e509]: s
      - button "Collapse issues badge" [ref=f1e510]
  - alert [ref=f1e513]
```

# Test source

```ts
  43  |     const order = await createOrder(customer);
  44  |     await adminLogin(page, "owner@e2e.test");
  45  | 
  46  |     await page.goto(`${ADMIN_URL}/requests`);
  47  |     await page.getByRole("link", { name: order.ref }).click();
  48  |     await expect(page.getByRole("heading", { level: 1 })).toContainText(order.ref);
  49  | 
  50  |     await page.getByRole("button", { name: "Approve" }).click();
  51  |     await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  52  |     await expectToast(page, "Status updated");
  53  | 
  54  |     await page.getByRole("link", { name: /^Payments/ }).click();
  55  |     await page.getByRole("button", { name: "Record payment" }).first().click();
  56  |     const dialog = page.getByRole("dialog");
  57  |     await dialog.getByLabel("Reference").fill("BANK-123");
  58  |     await dialog.getByRole("button", { name: "Record and confirm" }).click();
  59  |     await expectToast(page, "Payment recorded and confirmed");
  60  |     const year = new Date().getFullYear();
  61  |     await expect(page.getByRole("link", { name: new RegExp(`RCT-${year}-\\d{4}`) }).first()).toBeVisible();
  62  | 
  63  |     // Now setup can start (payment confirmed).
  64  |     await page.getByRole("button", { name: "Start setup" }).click();
  65  |     await page.getByRole("dialog").getByRole("button", { name: "Start setup" }).click();
  66  |     await expectToast(page, "Status updated");
  67  | 
  68  |     const [row] = await sql<{ status: string }>(`select status from public.orders where id = $1`, [order.id]);
  69  |     expect(row!.status).toBe("setting_up");
  70  |   });
  71  | });
  72  | 
  73  | test.describe("products", () => {
  74  |   test("create a product with the wizard; it appears in the menu, hidden", async ({ page }) => {
  75  |     await adminLogin(page, "owner@e2e.test");
  76  |     await page.goto(`${ADMIN_URL}/products/new`);
  77  |     await page.getByLabel("Product name").fill("Retexia Books");
  78  |     await expect(page.getByLabel("Web address")).toHaveValue("books");
  79  |     await expect(page.getByLabel("Request code")).toHaveValue("BOO");
  80  |     await page.getByRole("button", { name: "Continue" }).click();
  81  |     await page.getByRole("button", { name: "Continue" }).click(); // colour
  82  |     await page.getByLabel("Name", { exact: true }).fill("Books Starter");
  83  |     await page.getByLabel(/^Monthly price/).fill("4900");
  84  |     await page.getByRole("button", { name: "Continue" }).click();
  85  |     await page.getByRole("button", { name: "Continue" }).click(); // page and form
  86  |     await page.getByRole("button", { name: "Create product" }).click();
  87  |     await page.waitForURL(`${ADMIN_URL}/products/books`);
  88  |     await expect(page.getByRole("heading", { level: 1 })).toContainText("Retexia Books");
  89  |     await expect(page.getByText("Hidden").first()).toBeVisible();
  90  |     await expect(page.getByRole("navigation").first().getByRole("link", { name: "Books" })).toBeVisible();
  91  | 
  92  |     const [p] = await sql<{ n: number; f: string | null }>(
  93  |       `select (select count(*)::int from public.packages k where k.product_id = p.id) n, p.onboarding_form_id::text f from public.products p where slug = 'books'`,
  94  |     );
  95  |     expect(p!.n).toBe(1);
  96  |     expect(p!.f).not.toBeNull();
  97  |   });
  98  | 
  99  |   test("add a service field and an n8n action", async ({ page }) => {
  100 |     await adminLogin(page, "owner@e2e.test");
  101 |     await page.goto(`${ADMIN_URL}/products/lingo?tab=service-fields`);
  102 |     await page.getByRole("button", { name: "Add field" }).click();
  103 |     await page.getByLabel("Label").fill("Support group link");
  104 |     await expect(page.getByLabel("Key")).toHaveValue("support_group_link");
  105 |     await page.getByRole("button", { name: "Save field" }).click();
  106 |     await expectToast(page, "Service field saved");
  107 | 
  108 |     await page.goto(`${ADMIN_URL}/products/lingo?tab=actions`);
  109 |     await page.getByRole("button", { name: "Add action" }).click();
  110 |     await page.getByLabel("Button label").fill("Send welcome message");
  111 |     await page.getByLabel("n8n webhook URL").fill("https://n8n.example.com/webhook/welcome");
  112 |     await page.getByRole("button", { name: "Generate" }).click();
  113 |     await expect(page.getByText(/Copy this secret now/)).toBeVisible();
  114 |     await page.getByRole("button", { name: "Save action" }).click();
  115 |     await expectToast(page, "Action saved");
  116 |     await expect(page.getByText("n8n.example.com").first()).toBeVisible();
  117 | 
  118 |     // The secret never comes back to the browser.
  119 |     const html = await page.content();
  120 |     expect(html).not.toMatch(/whsec_[0-9a-f]{48}/);
  121 |   });
  122 | });
  123 | 
  124 | test.describe("website editing", () => {
  125 |   test("form builder: add a question and save a new version", async ({ page }) => {
  126 |     await adminLogin(page, "owner@e2e.test");
  127 |     const [f] = await sql<{ id: string; version: number }>(`select f.id, f.version from public.forms f join public.products p on p.onboarding_form_id = f.id where p.slug = 'lingo'`);
  128 |     await page.goto(`${ADMIN_URL}/forms/${f!.id}`);
  129 |     await page.getByRole("button", { name: "Add question" }).first().click();
  130 |     await page.getByLabel("Question", { exact: true }).fill("How did you hear about us?");
  131 |     await page.getByRole("button", { name: "Save form" }).click();
  132 |     await expectToast(page, `Saved as version ${f!.version + 1}`);
  133 |     await page.getByRole("tab", { name: "Preview" }).click();
  134 |     await expect(page.getByText(/Preview with your unsaved changes/)).toBeVisible();
  135 |   });
  136 | 
  137 |   test("edit a section on the home page", async ({ page }) => {
  138 |     await adminLogin(page, "editor@e2e.test");
  139 |     const [home] = await sql<{ id: string }>(`select id from public.pages where slug = ''`);
  140 |     await page.goto(`${ADMIN_URL}/website/pages/${home!.id}`);
  141 |     await page.getByRole("button", { name: /Hero/ }).first().click();
  142 |     const title = page.getByLabel("Title", { exact: true });
> 143 |     await title.fill("Your business, answered in seconds");
      |                 ^ TimeoutError: locator.fill: Timeout 15000ms exceeded.
  144 |     await page.getByLabel("Highlighted words").fill("in seconds");
  145 |     await page.getByRole("button", { name: "Save section" }).click();
  146 |     await expectToast(page, /Section saved/);
  147 |     const [s] = await sql<{ title: string }>(`select title from public.page_sections where page_id = $1 and type = 'hero'`, [home!.id]);
  148 |     expect(s!.title).toBe("Your business, answered in seconds");
  149 |   });
  150 | 
  151 |   test("text and labels shows the missing-keys report and saves overrides", async ({ page }) => {
  152 |     await sql(`delete from public.site_strings where key = 'nav.skip'`);
  153 |     await adminLogin(page, "editor@e2e.test");
  154 |     await page.goto(`${ADMIN_URL}/website/strings`);
  155 |     await expect(page.getByText("Missing keys report")).toBeVisible();
  156 |     await page.getByRole("button", { name: /Not in database/ }).click();
  157 |     const field = page.getByLabel("Text for nav.skip");
  158 |     await field.fill("Skip to the main content");
  159 |     await field.locator("xpath=..").getByRole("button", { name: "Save" }).click();
  160 |     await expectToast(page, /Text saved/);
  161 |     const [row] = await sql<{ value: string }>(`select value from public.site_strings where key = 'nav.skip'`);
  162 |     expect(row!.value).toBe("Skip to the main content");
  163 |   });
  164 | });
  165 | 
  166 | test.describe("settings", () => {
  167 |   test("team: owners see two-step status and roles", async ({ page }) => {
  168 |     await adminLogin(page, "owner@e2e.test");
  169 |     await page.goto(`${ADMIN_URL}/settings/team`);
  170 |     await expect(page.getByText("Olivia Owner")).toBeVisible();
  171 |     await expect(page.getByLabel("Role of Eddie Editor")).toHaveValue("editor");
  172 |   });
  173 | 
  174 |   test("audit log records changes", async ({ page }) => {
  175 |     await adminLogin(page, "owner@e2e.test");
  176 |     await page.goto(`${ADMIN_URL}/settings/audit?table=products`);
  177 |     await expect(page.getByText(/products/).first()).toBeVisible();
  178 |   });
  179 | 
  180 |   test("password change keeps working sign-in", async ({ page }) => {
  181 |     await adminLogin(page, "admin@e2e.test");
  182 |     await page.goto(`${ADMIN_URL}/account`);
  183 |     await page.getByLabel("New password").fill(`${PASSWORD}-2`);
  184 |     await page.getByLabel("Repeat it").fill(`${PASSWORD}-2`);
  185 |     await page.getByRole("button", { name: "Change password" }).click();
  186 |     await expectToast(page, "Password changed");
  187 |   });
  188 | });
  189 | 
```