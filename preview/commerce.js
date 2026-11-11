(function(){const module={exports:{}};
/* Shared, side-effect-free rules for the YOSH local test storefront. */
var MAX_QUANTITY = 20;

function copy(value) { return JSON.parse(JSON.stringify(value)); }
function fail(code, message) { var error = new Error(message); error.code = code; throw error; }
function productsOf(catalog) { return catalog && Array.isArray(catalog.products) ? catalog.products : []; }
function getProducts(catalog, options) {
  options = options || {};
  var query = String(options.query || '').trim().toLowerCase();
  return productsOf(catalog).filter(function (product) {
    if (options.categoryId && options.categoryId !== 'all' && product.categoryId !== options.categoryId) return false;
    if (!query) return true;
    var labels = (product.variants || []).map(function (variant) { return variant.label || ''; });
    return [product.title, product.subtitle, product.series, product.description].concat(labels).join(' ').toLowerCase().indexOf(query) !== -1;
  });
}
function getProduct(catalog, id) {
  return productsOf(catalog).find(function (product) { return product.id === id; }) || null;
}
function getVariant(product, id) {
  var variants = product && Array.isArray(product.variants) ? product.variants : [];
  if (id === undefined || id === null || id === '') return variants[0] || null;
  return variants.find(function (variant) { return variant.id === id; }) || null;
}
function validPrice(value) { return Number.isSafeInteger(value) && value >= 0; }
function formatMoney(fen) {
  if (!validPrice(fen)) return '待定';
  return Math.floor(fen / 100) + '.' + ('0' + (fen % 100)).slice(-2);
}
function cartKey(productId, variantId) { return encodeURIComponent(productId) + '::' + encodeURIComponent(variantId); }
function normalizeCart(catalog, raw) {
  var result = [], byKey = Object.create(null);
  (Array.isArray(raw) ? raw : []).forEach(function (row) {
    if (!row || typeof row.productId !== 'string' || !row.productId || typeof row.variantId !== 'string' || !row.variantId) return;
    var product = getProduct(catalog, row.productId), variant = getVariant(product, row.variantId);
    if (!product || !variant) return;
    var number = row.quantity === undefined ? 1 : Number(row.quantity);
    if (!Number.isFinite(number) || number < 1) return;
    var quantity = Math.min(MAX_QUANTITY, Math.floor(number));
    var key = cartKey(product.id, variant.id);
    if (byKey[key]) {
      byKey[key].quantity = Math.min(MAX_QUANTITY, byKey[key].quantity + quantity);
      byKey[key].selected = byKey[key].selected || row.selected !== false;
      return;
    }
    var clean = { key: key, productId: product.id, variantId: variant.id, quantity: quantity, selected: row.selected !== false };
    byKey[key] = clean; result.push(clean);
  });
  return result;
}
function cartView(catalog, raw) {
  var quantity = 0, selectedCount = 0, totalFen = 0, hasUnpriced = false;
  var rows = normalizeCart(catalog, raw);
  var items = rows.map(function (row) {
    var product = getProduct(catalog, row.productId), variant = getVariant(product, row.variantId);
    var unit = validPrice(variant.priceFen) ? variant.priceFen : null;
    var line = unit === null || !Number.isSafeInteger(unit * row.quantity) ? null : unit * row.quantity;
    quantity += row.quantity;
    if (row.selected) {
      selectedCount += row.quantity;
      if (line === null || !Number.isSafeInteger(totalFen + line)) hasUnpriced = true;
      else totalFen += line;
    }
    return Object.assign({}, row, { product: product, variant: variant, unitPriceFen: unit, lineTotalFen: line });
  });
  return { items: items, quantity: quantity, totalFen: hasUnpriced ? null : totalFen, selectedCount: selectedCount, hasUnpriced: hasUnpriced, allSelected: items.length > 0 && items.every(function (row) { return row.selected; }) };
}
function inputQuantity(value, allowZero) {
  var quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < (allowZero ? 0 : 1)) fail('INVALID_QUANTITY', '请选择有效的整数数量');
  if (quantity > MAX_QUANTITY) fail('QUANTITY_LIMIT', '单款最多20件（测试数量上限）');
  return quantity;
}
function addToCart(catalog, raw, productId, variantId, quantity) {
  var product = getProduct(catalog, productId), variant = getVariant(product, variantId);
  if (!product || !variant) fail('PRODUCT_UNAVAILABLE', '此商品或规格已不可用，请重新选择');
  var amount = inputQuantity(quantity === undefined ? 1 : quantity, false);
  var rows = normalizeCart(catalog, raw), key = cartKey(product.id, variant.id);
  var existing = rows.find(function (row) { return row.key === key; });
  if (existing) { existing.quantity = inputQuantity(existing.quantity + amount, false); existing.selected = true; }
  else rows.push({ key: key, productId: product.id, variantId: variant.id, quantity: amount, selected: true });
  return rows;
}
function setQuantity(catalog, raw, key, value) {
  var quantity = inputQuantity(value, true);
  var rows = normalizeCart(catalog, raw);
  if (quantity === 0) return rows.filter(function (row) { return row.key !== key; });
  return rows.map(function (row) { if (row.key === key) row.quantity = quantity; return row; });
}
function setSelected(catalog, raw, key, selected) {
  return normalizeCart(catalog, raw).map(function (row) { if (row.key === key) row.selected = Boolean(selected); return row; });
}
function removeFromCart(raw, key) { return copy((Array.isArray(raw) ? raw : []).filter(function (row) { return row && row.key !== key; })); }
function cleanAddress(address) {
  address = address || {};
  return { name: String(address.name || '').trim(), phone: String(address.phone || '').replace(/[\s-]/g, ''), region: (Array.isArray(address.region) ? address.region.join(' ') : String(address.region || '')).trim(), detail: String(address.detail || '').trim() };
}
function validateAddress(address) {
  var value = cleanAddress(address);
  if (!value.name || value.name.length > 40) fail('ADDRESS_NAME', '请填写收货人姓名（不超过40字）');
  if (!/^\+?\d{7,15}$/.test(value.phone)) fail('ADDRESS_PHONE', '请填写有效联系电话');
  if (!value.region || value.region.length > 100) fail('ADDRESS_REGION', '请填写所在地区');
  if (value.detail.length < 5 || value.detail.length > 200) fail('ADDRESS_DETAIL', '请填写详细地址（5至200字）');
  return value;
}
function keyHash(value) {
  var hash = 2166136261;
  for (var i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36).toUpperCase();
}
function createTestOrder(catalog, raw, address, options) {
  options = options || {};
  var cart = normalizeCart(catalog, raw), view = cartView(catalog, cart);
  if (!view.selectedCount) fail('EMPTY_CHECKOUT', '请先选择要结算的商品');
  if (view.hasUnpriced || view.totalFen === null) fail('UNPRICED_PRODUCT', '选中商品的价格待定，暂不能提交订单');
  var selected = view.items.filter(function (row) { return row.selected; });
  if (selected.some(function (row) { return row.variant.priceKind !== 'test'; })) fail('NOT_TEST_PRICE', '仅支持以明确标注的测试价格创建本地测试订单');
  var recipient = validateAddress(address);
  var now = typeof options.now === 'function' ? options.now() : options.now;
  var stamp = now === undefined ? Date.now() : new Date(now).getTime();
  if (!Number.isSafeInteger(stamp) || stamp < 0) fail('INVALID_DATE', '订单时间无效');
  var idempotencyKey = options.idempotencyKey ? String(options.idempotencyKey) : '';
  var suffix = keyHash(idempotencyKey || String(Math.random()));
  var order = {
    id: 'YOSH-T-' + stamp.toString(36).toUpperCase() + '-' + suffix,
    mode: 'test', status: 'test_unpaid', paymentStatus: 'not_charged', priceKind: 'test',
    createdAt: stamp, idempotencyKey: idempotencyKey, totalFen: view.totalFen,
    totalKind: 'test_goods_subtotal', shippingStatus: 'not_connected',
    notice: '本地测试订单，未扣款、未发货；测试价格不代表实际售价。',
    address: recipient,
    items: selected.map(function (row) {
      return { key: row.key, productId: row.productId, variantId: row.variantId, title: row.product.title, productTitle: row.product.title, variantLabel: row.variant.label, cover: row.product.cover || '', quantity: row.quantity, unitPriceFen: row.unitPriceFen, lineTotalFen: row.lineTotalFen, priceKind: 'test' };
    })
  };
  return { order: order, cart: cart.filter(function (row) { return !row.selected; }) };
}

module.exports = { MAX_QUANTITY: MAX_QUANTITY, getProducts: getProducts, getProduct: getProduct, getVariant: getVariant, formatMoney: formatMoney, normalizeCart: normalizeCart, cartView: cartView, addToCart: addToCart, setQuantity: setQuantity, setSelected: setSelected, removeFromCart: removeFromCart, cleanAddress: cleanAddress, validateAddress: validateAddress, createTestOrder: createTestOrder };

window.Commerce=module.exports;})();
