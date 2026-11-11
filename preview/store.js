(function(){const module={exports:{}};window.wx={getStorageSync:function(k){var s=localStorage.getItem(k);return s===null?'':JSON.parse(s)},setStorageSync:function(k,v){localStorage.setItem(k,JSON.stringify(v))},removeStorageSync:function(k){localStorage.removeItem(k)}};const require=function(p){if(p==='./commerce.js')return window.Commerce;throw Error('Unsupported local dependency')};
/* One atomic local record prevents cart/order half-writes and duplicate test orders. */
var commerce = require('./commerce.js');
var STATE_KEY = 'yosh-store-v1-commerce';
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function error(code, message) { var value = new Error(message); value.code = code; return value; }
function api() {
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function' || typeof wx.setStorageSync !== 'function') throw error('STORAGE_UNAVAILABLE', '本地存储不可用，请允许当前浏览器保存网站数据后重试');
  return wx;
}
function fresh() { return { version: 1, cart: [], orders: [], address: { name: '', phone: '', region: '', detail: '' } }; }
function read() {
  var value;
  try { value = api().getStorageSync(STATE_KEY); }
  catch (cause) { throw error('STORAGE_READ_FAILED', '无法读取本机商城数据，请稍后重试'); }
  if (value === undefined || value === null || value === '') return fresh();
  if (!value || typeof value !== 'object' || value.version !== 1 || !Array.isArray(value.cart) || !Array.isArray(value.orders)) throw error('STORAGE_INVALID', '本机商城数据格式异常，请勿重复提交订单');
  return copy(value);
}
function write(value) {
  try { api().setStorageSync(STATE_KEY, copy(value)); }
  catch (cause) { throw error('STORAGE_WRITE_FAILED', '本地保存失败，测试订单未提交，请重试'); }
}
function safeCart(raw) {
  return (Array.isArray(raw) ? raw : []).filter(function (row) { return row && typeof row.productId === 'string' && typeof row.variantId === 'string' && Number.isSafeInteger(row.quantity) && row.quantity > 0 && row.quantity <= commerce.MAX_QUANTITY; }).map(function (row) {
    return { key: encodeURIComponent(row.productId) + '::' + encodeURIComponent(row.variantId), productId: row.productId, variantId: row.variantId, quantity: row.quantity, selected: row.selected !== false };
  });
}
function loadCart() { return read().cart; }
function saveCart(cart) { var state = read(); state.cart = safeCart(cart); write(state); return copy(state.cart); }
function loadOrders() { return read().orders; }
function saveOrders(orders) {
  if (!Array.isArray(orders) || orders.some(function (order) { return !order || !order.id || ['test_unpaid', 'test_cancelled'].indexOf(order.status) === -1 || order.paymentStatus !== 'not_charged'; })) throw error('INVALID_TEST_ORDER', '只能保存未扣款的预览测试订单');
  var state = read(); state.orders = copy(orders); write(state); return copy(state.orders);
}
function loadAddress() { return commerce.cleanAddress(read().address); }
function saveAddress(address) { var state = read(); state.address = commerce.cleanAddress(address); write(state); return copy(state.address); }
function submitTestOrder(catalog, address, idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 128) throw error('IDEMPOTENCY_REQUIRED', '请重新打开订单确认页后提交');
  var state = read();
  var existing = state.orders.find(function (order) { return order.idempotencyKey === idempotencyKey; });
  if (existing) return { order: copy(existing), cart: commerce.normalizeCart(catalog, state.cart), reused: true };
  var result = commerce.createTestOrder(catalog, state.cart, address, { idempotencyKey: idempotencyKey });
  state.orders.unshift(result.order); state.cart = result.cart; state.address = result.order.address;
  write(state);
  return { order: copy(result.order), cart: copy(result.cart), reused: false };
}
module.exports = { STATE_KEY: STATE_KEY, loadCart: loadCart, saveCart: saveCart, loadOrders: loadOrders, saveOrders: saveOrders, loadAddress: loadAddress, saveAddress: saveAddress, submitTestOrder: submitTestOrder };

window.Store=module.exports;})();
