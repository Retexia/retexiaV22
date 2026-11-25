// ---- The order form (WhatsApp Flow JSON): one screen, no server endpoint. Product, price and the
// quantity list (with totals) come in the message that opens it; the answers come back to the webhook
// as an nfm_reply message. Labels are Sinhala + English so every customer understands them. ----
const orderFormJson = (version) => ({
  version: String(version || '7.0'),
  screens: [{
    id: 'ORDER',
    title: 'ඕඩර් එක · Order',
    terminal: true,
    success: true,
    data: {
      product: { type: 'string', __example__: 'Ayora Gastric Care Tablets' },
      price_line: { type: 'string', __example__: 'Rs. 1,340 + delivery Rs. 450 · Cash on delivery' },
      pid: { type: 'string', __example__: '517' },
      name: { type: 'string', __example__: 'Nimal' },
      phone: { type: 'string', __example__: '0771234567' },
      qty: { type: 'string', __example__: '1' },
      qty_options: {
        type: 'array',
        items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
        __example__: [{ id: '1', title: '1 · Rs. 1,790' }, { id: '2', title: '2 · Rs. 3,130' }],
      },
    },
    layout: {
      type: 'SingleColumnLayout',
      children: [
        { type: 'TextSubheading', text: '${data.product}' },
        { type: 'TextBody', text: '${data.price_line}' },
        { type: 'TextInput', name: 'name', label: 'නම (Name)', 'input-type': 'text', required: true, 'init-value': '${data.name}' },
        { type: 'TextArea', name: 'address', label: 'ලිපිනය (Address)', required: true, 'helper-text': 'ගෙදර අංකය, පාර, නගරය · House no, street, town' },
        { type: 'TextInput', name: 'phone', label: 'දුරකථන අංකය (Phone)', 'input-type': 'phone', required: true, 'init-value': '${data.phone}' },
        { type: 'TextInput', name: 'phone2', label: 'තවත් අංකයක් (2nd)', 'input-type': 'phone', required: false },
        { type: 'Dropdown', name: 'qty', label: 'ප්‍රමාණය (Quantity)', 'data-source': '${data.qty_options}', required: true, 'init-value': '${data.qty}' },
        {
          type: 'Footer',
          label: 'ඕඩර් එක යවන්න · Send order',
          'on-click-action': {
            name: 'complete',
            payload: { name: '${form.name}', address: '${form.address}', phone: '${form.phone}', phone2: '${form.phone2}', qty: '${form.qty}', pid: '${data.pid}' },
          },
        },
      ],
    },
  }],
});
