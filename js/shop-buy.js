// Shopify Buy Button for shop.html. Every .shop-cta-mount[data-shopify-product]
// gets an add-to-cart button plus the shared cart drawer and floating cart tab.
// The mount starts with a plain cart-permalink link, so if the SDK never loads
// (blocked, offline) the card can still sell; it is removed once the real
// button has rendered. The storefront token is Shopify's public, read-only key.

(function shopBuy() {
  const mounts = [...document.querySelectorAll('[data-shopify-product]')];
  if (!mounts.length) return;

  const SDK = 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js';
  const SHOP = {
    domain: 'xcqc4a-1a.myshopify.com',
    storefrontAccessToken: 'ff5d854ae42e17df40b58048347fafcb',
  };

  // Site tokens from css/style.css. The product button renders inline and is
  // styled in css/shop.css; the cart and its tab are iframes, so they take
  // their look from these values instead.
  const C = {
    bg: '#030304', panel: '#0a0b0c', border: '#2f4a4f',
    blue: '#00e5ff', blueDim: '#007a8a', text: '#c9f2ff', textDim: '#5f7a80',
  };
  const MONO = "'IBM Plex Mono', ui-monospace, monospace";
  const btn = {
    'font-family': MONO, 'font-size': '11px', 'font-weight': '600',
    'letter-spacing': '0.12em', 'text-transform': 'uppercase',
    color: C.bg, 'background-color': C.blue, 'border-radius': '0',
    ':hover': { color: C.bg, 'background-color': C.text },
    ':focus': { color: C.bg, 'background-color': C.text },
  };
  const ink = { color: C.text, 'font-family': MONO };

  const options = {
    product: {
      iframe: false,
      contents: { img: false, title: false, price: false, options: false },
      text: { button: '[ add to cart ]' },
    },
    cart: {
      text: {
        title: '// CART', total: 'subtotal', button: '[ checkout ]', empty: 'cart is empty',
        thanks: 'Thank you for supporting the start to our journey. It means a lot to us.',
      },
      // Shopify's line-items template, plus the thank-you note as a last list
      // row (the list stretches to the footer, so after it would be hidden)
      // whenever the cart isn't empty. The cart is an iframe, so the
      // note is styled inline.
      templates: {
        lineItems: '<div class="{{data.classes.cart.cartScroll}}{{#data.contents.note}} {{data.classes.cart.cartScrollWithCartNote}}{{/data.contents.note}}{{#data.discounts}} {{data.classes.cart.cartScrollWithDiscounts}}{{/data.discounts}}" data-element="cart.cartScroll">'
          + '{{#data.isEmpty}}<p class="{{data.classes.cart.empty}} {{data.classes.cart.emptyCart}}" data-element="cart.empty">{{data.text.empty}}</p>{{/data.isEmpty}}'
          + '<ul role="list" class="{{data.classes.cart.lineItems}}" data-element="cart.lineItems">{{{data.lineItemsHtml}}}'
          + '{{^data.isEmpty}}<li data-element="cart.thanks" style="list-style:none;margin:4px 0 0;padding:14px 0 0;border-top:1px dashed ' + C.border
          + ';font-family:' + MONO.replace(/'/g, '&#39;') + ';font-size:12px;line-height:1.6;color:' + C.textDim + ';">{{data.text.thanks}}</li>{{/data.isEmpty}}'
          + '</ul></div>',
      },
      styles: {
        cart: { 'background-color': C.panel, 'border-left': '1px solid ' + C.border, 'font-family': MONO },
        header: ink, title: Object.assign({ 'text-transform': 'uppercase', 'letter-spacing': '0.12em' }, ink),
        lineItems: ink, subtotalText: ink, subtotal: ink, currency: ink, empty: ink,
        notice: { color: C.textDim, 'font-family': MONO },
        close: { color: C.textDim, ':hover': { color: C.blue } },
        footer: { 'background-color': C.panel, 'border-top': '1px solid ' + C.border },
        button: btn,
      },
      googleFonts: ['IBM Plex Mono'],
    },
    lineItem: {
      styles: {
        title: ink, variantTitle: { color: C.textDim }, price: ink, fullPrice: ink,
        quantity: ink,
        quantityInput: { color: C.text, 'border-color': C.border, 'background-color': C.bg },
        quantityIncrement: { color: C.text, 'border-color': C.border },
        quantityDecrement: { color: C.text, 'border-color': C.border },
      },
    },
    toggle: {
      styles: {
        toggle: { 'font-family': MONO, 'background-color': C.blue, ':hover': { 'background-color': C.text }, ':focus': { 'background-color': C.text } },
        count: { color: C.bg, ':hover': { color: C.bg } },
        iconPath: { fill: C.bg },
      },
      googleFonts: ['IBM Plex Mono'],
    },
  };

  // Add-to-cart feedback: the button flashes, a few sparks burst off it, and
  // a small "thank you!" floats up and fades. Reduced motion keeps the text.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const celebrate = (node) => {
    const button = node.querySelector('.shopify-buy__btn');
    if (button) {
      button.classList.remove('is-sparkling');
      void button.offsetWidth; // restart the animation on repeat clicks
      button.classList.add('is-sparkling');
    }
    const burst = document.createElement('span');
    burst.className = 'shop-burst';
    burst.setAttribute('aria-hidden', 'true');
    if (!reduced) {
      for (let i = 0; i < 12; i++) {
        const spark = document.createElement('i');
        const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 34 + Math.random() * 26;
        spark.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
        spark.style.setProperty('--dy', (Math.sin(angle) * dist * 0.7).toFixed(1) + 'px');
        spark.style.animationDelay = (Math.random() * 80).toFixed(0) + 'ms';
        burst.appendChild(spark);
      }
    }
    const thanks = document.createElement('span');
    thanks.className = 'shop-thanks';
    thanks.textContent = 'thank you!';
    burst.appendChild(thanks);
    node.appendChild(burst);
    setTimeout(() => burst.remove(), 1600);
  };

  const init = () => {
    const client = window.ShopifyBuy.buildClient(SHOP);
    window.ShopifyBuy.UI.onReady(client).then((ui) => {
      mounts.forEach((node) => {
        const fallback = node.querySelector('.shop-cta');
        const product = Object.assign({}, options.product, {
          events: {
            afterRender: () => { if (fallback) fallback.remove(); },
            addVariantToCart: () => celebrate(node),
          },
        });
        ui.createComponent('product', {
          id: node.dataset.shopifyProduct,
          node,
          moneyFormat: '%24%7B%7Bamount_no_decimals%7D%7D',
          options: Object.assign({}, options, { product }),
        });
      });
    });
  };

  if (window.ShopifyBuy && window.ShopifyBuy.UI) { init(); return; }
  const script = document.createElement('script');
  script.async = true;
  script.src = SDK;
  script.onload = init;
  document.head.appendChild(script);
})();
