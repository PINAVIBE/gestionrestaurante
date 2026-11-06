const express = require('express');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const COOKIE = 'sid';
const TTL = 8 * 60 * 60 * 1000; // sesión de 8 horas
const CATEGORIAS = ['Almuerzos', 'Snacks', 'Bebidas', 'Postres'];
const ROLES = ['cliente', 'cocina', 'admin'];
const SIG = { Pendiente: 'Preparando', Preparando: 'Listo', Listo: 'Entregado' };
const DUMMY_HASH = bcrypt.hashSync('no-existe', 10);

app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store' });
  next();
});

// ---------- utilidades ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg, status = 400) => { throw new HttpError(status, msg); };
const wrap = fn => (req, res, next) => { try { fn(req, res); } catch (e) { next(e); } };
const txt = (v, max, campo) => {
  if (typeof v !== 'string' || !v.trim()) bad(`${campo} es obligatorio`);
  if (v.trim().length > max) bad(`${campo} es demasiado largo`);
  return v.trim();
};
const ent = (v, campo, { min = 0, max = 1e9 } = {}) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) bad(`${campo} debe ser un número entero válido`);
  return n;
};
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 120;
const hash = t => crypto.createHash('sha256').update(t).digest('hex');
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean)
  .map(c => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const publico = u => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol });

// ---------- sesiones ----------
function abrirSesion(res, usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sesiones (token_hash,usuario_id,expira) VALUES (?,?,?)').run(hash(token), usuarioId, Date.now() + TTL);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: TTL, secure: process.env.NODE_ENV === 'production' });
}
db.prepare('DELETE FROM sesiones WHERE expira < ?').run(Date.now());

const auth = (...roles) => (req, res, next) => {
  const t = cookies(req)[COOKIE];
  const u = t && db.prepare(`SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
                             WHERE s.token_hash = ? AND s.expira > ?`).get(hash(t), Date.now());
  if (!u) return res.status(401).json({ error: 'Sesión no válida. Inicia sesión.' });
  if (roles.length && !roles.includes(u.rol)) return res.status(403).json({ error: 'No tienes permiso para esto' });
  req.user = u;
  next();
};

// Límite simple de intentos fallidos de login (por IP + correo)
const intentos = new Map();
const LIM = 8, VENTANA = 15 * 60 * 1000;
const bloqueado = k => { const r = intentos.get(k); return r && r.reset > Date.now() && r.n >= LIM; };
const fallo = k => {
  const r = intentos.get(k);
  if (!r || r.reset < Date.now()) intentos.set(k, { n: 1, reset: Date.now() + VENTANA }); else r.n++;
};

// ---------- autenticación ----------
app.post('/api/login', wrap((req, res) => {
  const email = txt(req.body.email, 120, 'El correo').toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const key = req.ip + '|' + email;
  if (bloqueado(key)) bad('Demasiados intentos. Espera unos minutos.', 429);
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  const ok = bcrypt.compareSync(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) { fallo(key); bad('Correo o contraseña incorrectos', 401); }
  intentos.delete(key);
  abrirSesion(res, u.id);
  res.json(publico(u));
}));

app.post('/api/registro', wrap((req, res) => {
  const nombre = txt(req.body.nombre, 80, 'El nombre');
  const email = txt(req.body.email, 120, 'El correo').toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!emailOk(email)) bad('Correo no válido');
  if (password.length < 8 || password.length > 72) bad('La contraseña debe tener entre 8 y 72 caracteres');
  if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) bad('Ese correo ya está registrado', 409);
  const id = db.prepare('INSERT INTO usuarios (nombre,email,password_hash,rol) VALUES (?,?,?,?)')
    .run(nombre, email, bcrypt.hashSync(password, 10), 'cliente').lastInsertRowid; // el registro público siempre es "cliente"
  abrirSesion(res, id);
  res.status(201).json(publico(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)));
}));

app.post('/api/logout', (req, res) => {
  const t = cookies(req)[COOKIE];
  if (t) db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(hash(t));
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get('/api/me', auth(), (req, res) => res.json(publico(req.user)));

// ---------- productos ----------
const leerProducto = b => ({
  nombre: txt(b.nombre, 80, 'El nombre'),
  cat: CATEGORIAS.includes(b.cat) ? b.cat : bad('Categoría no válida'),
  desc: typeof b.desc === 'string' ? b.desc.trim().slice(0, 300) : '',
  precio: ent(b.precio, 'El precio'),
  stock: ent(b.stock, 'El stock'),
  min: ent(b.min, 'El stock mínimo'),
});

app.get('/api/productos', auth(), (req, res) => res.json(db.prepare('SELECT * FROM productos ORDER BY id').all()));

app.post('/api/productos', auth('admin'), wrap((req, res) => {
  const p = leerProducto(req.body);
  const id = db.prepare('INSERT INTO productos (nombre,cat,desc,precio,stock,min) VALUES (@nombre,@cat,@desc,@precio,@stock,@min)').run(p).lastInsertRowid;
  res.status(201).json({ id, ...p });
}));

app.put('/api/productos/:id', auth('admin'), wrap((req, res) => {
  const p = leerProducto(req.body);
  const r = db.prepare('UPDATE productos SET nombre=@nombre,cat=@cat,desc=@desc,precio=@precio,stock=@stock,min=@min WHERE id=@id')
    .run({ ...p, id: +req.params.id });
  if (!r.changes) bad('Producto no encontrado', 404);
  res.json({ ok: true });
}));

app.delete('/api/productos/:id', auth('admin'), wrap((req, res) => {
  if (!db.prepare('DELETE FROM productos WHERE id = ?').run(+req.params.id).changes) bad('Producto no encontrado', 404);
  res.json({ ok: true });
}));

app.post('/api/productos/:id/stock', auth('admin'), wrap((req, res) => {
  const d = ent(req.body.delta, 'El ajuste', { min: -1000, max: 1000 });
  const r = db.prepare('UPDATE productos SET stock = MAX(0, stock + ?) WHERE id = ?').run(d, +req.params.id);
  if (!r.changes) bad('Producto no encontrado', 404);
  res.json({ ok: true });
}));

// ---------- pedidos ----------
function listarPedidos(usuarioId) {
  const pedidos = usuarioId
    ? db.prepare('SELECT * FROM pedidos WHERE usuario_id = ? ORDER BY id').all(usuarioId)
    : db.prepare('SELECT * FROM pedidos ORDER BY id').all();
  const items = db.prepare('SELECT pedido_id, producto_id AS id, nombre, precio, qty FROM pedido_items ORDER BY id').all();
  const porPedido = {};
  items.forEach(({ pedido_id, ...i }) => (porPedido[pedido_id] ||= []).push(i));
  return pedidos.map(p => ({ id: p.id, cliente: p.cliente, total: p.total, estado: p.estado, fecha: p.fecha, items: porPedido[p.id] || [] }));
}

app.get('/api/pedidos', auth(), (req, res) =>
  res.json(listarPedidos(req.user.rol === 'cliente' ? req.user.id : null)));

const crearPedido = db.transaction((user, items) => {
  const filas = items.map(({ id, qty }) => {
    const p = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
    if (!p) bad('Un producto del pedido ya no existe');
    if (p.stock < qty) bad(`No hay suficiente stock de "${p.nombre}"`, 409);
    db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ?').run(qty, p.id);
    return { p, qty };
  });
  const total = filas.reduce((s, { p, qty }) => s + p.precio * qty, 0); // el precio SIEMPRE se calcula en el servidor
  const pid = db.prepare('INSERT INTO pedidos (usuario_id,cliente,total,estado,fecha) VALUES (?,?,?,?,?)')
    .run(user.id, user.nombre, total, 'Pendiente', new Date().toISOString()).lastInsertRowid;
  const ins = db.prepare('INSERT INTO pedido_items (pedido_id,producto_id,nombre,precio,qty) VALUES (?,?,?,?,?)');
  filas.forEach(({ p, qty }) => ins.run(pid, p.id, p.nombre, p.precio, qty));
  return pid;
});

app.post('/api/pedidos', auth('cliente'), wrap((req, res) => {
  if (!Array.isArray(req.body.items) || !req.body.items.length || req.body.items.length > 30) bad('El pedido está vacío');
  const mapa = new Map();
  req.body.items.forEach(i => {
    const id = ent(i.id, 'El producto', { min: 1 }), qty = ent(i.qty, 'La cantidad', { min: 1, max: 50 });
    mapa.set(id, (mapa.get(id) || 0) + qty);
  });
  res.status(201).json({ id: crearPedido(req.user, [...mapa].map(([id, qty]) => ({ id, qty }))) });
}));

app.post('/api/pedidos/:id/avanzar', auth('cocina', 'admin'), wrap((req, res) => {
  const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(+req.params.id);
  if (!p) bad('Pedido no encontrado', 404);
  if (!SIG[p.estado]) bad('El pedido ya fue entregado');
  db.prepare('UPDATE pedidos SET estado = ? WHERE id = ?').run(SIG[p.estado], p.id);
  res.json({ estado: SIG[p.estado] });
}));

// ---------- usuarios (solo admin) ----------
app.get('/api/usuarios', auth('admin'), (req, res) =>
  res.json(db.prepare('SELECT id,nombre,email,rol FROM usuarios ORDER BY id').all()));

app.post('/api/usuarios', auth('admin'), wrap((req, res) => {
  const nombre = txt(req.body.nombre, 80, 'El nombre');
  const email = txt(req.body.email, 120, 'El correo').toLowerCase();
  const rol = ROLES.includes(req.body.rol) ? req.body.rol : bad('Rol no válido');
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!emailOk(email)) bad('Correo no válido');
  if (password.length < 8 || password.length > 72) bad('La contraseña debe tener entre 8 y 72 caracteres');
  if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) bad('Ese correo ya está registrado', 409);
  const id = db.prepare('INSERT INTO usuarios (nombre,email,password_hash,rol) VALUES (?,?,?,?)')
    .run(nombre, email, bcrypt.hashSync(password, 10), rol).lastInsertRowid;
  res.status(201).json({ id });
}));

app.delete('/api/usuarios/:id', auth('admin'), wrap((req, res) => {
  const id = +req.params.id;
  if (id === req.user.id) bad('No puedes eliminar tu propia cuenta');
  if (!db.prepare('DELETE FROM usuarios WHERE id = ?').run(id).changes) bad('Usuario no encontrado', 404);
  res.json({ ok: true });
}));

// ---------- frontend y errores ----------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => console.log(`Comedor Universitario en http://localhost:${PORT}`));
