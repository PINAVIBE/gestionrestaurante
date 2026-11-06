const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db = {productos: [], pedidos: [], usuarios: []};

async function api(method, url, body) {
  const r = await fetch(url, {method, credentials: 'same-origin',
    headers: body ? {'Content-Type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login' && url !== '/api/me') { mostrarLogin(); throw new Error('Tu sesión expiró. Inicia sesión de nuevo.'); }
  if (!r.ok) throw new Error(d.error || 'Error en el servidor');
  return d;
}
async function cargar() {
  const [productos, pedidos, usuarios] = await Promise.all([api('GET', '/api/productos'), api('GET', '/api/pedidos'),
    user.rol == 'admin' ? api('GET', '/api/usuarios') : []]);
  db = {productos, pedidos, usuarios};
}

let user = null, vista = '', cart = {}, filtro = 'Todos';
const $ = s => document.querySelector(s);
const money = n => '$' + n.toLocaleString('es-CO');
const NAV = {
  cliente: [['menu','Menú'],['mis','Mis pedidos']],
  cocina: [['cocina','Pedidos en cocina']],
  admin: [['dash','Dashboard'],['productos','Productos'],['inventario','Inventario'],['pedidos','Pedidos'],['ventas','Ventas y reportes'],['usuarios','Usuarios']]
};
const SIG = {Pendiente:'Preparando', Preparando:'Listo', Listo:'Entregado'};
const BTN = {Pendiente:'Empezar a preparar', Preparando:'Marcar como listo', Listo:'Entregar'};
const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2200); };
const ventas = () => db.pedidos.filter(p => p.estado === 'Entregado');

function form(titulo, campos, cb) {
  $('#frm').innerHTML = `<h3>${esc(titulo)}</h3>` + campos.map(c => `<label>${esc(c.l)}${c.o
    ? `<select name="${c.k}">${c.o.map(o => `<option ${o == c.v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    : `<input name="${c.k}" type="${c.t || 'text'}" value="${esc(c.v)}" required>`}</label>`).join('')
    + `<div class="acts"><button type="button" class="ghost" onclick="dlg.close()">Cancelar</button><button>Guardar</button></div>`;
  $('#frm').onsubmit = async e => {
    e.preventDefault();
    try { await cb(Object.fromEntries(new FormData(e.target))); dlg.close(); await cargar(); render(); }
    catch (err) { toast(err.message); }
  };
  dlg.showModal();
}

const V = {
  menu() {
    const cats = ['Todos', ...new Set(db.productos.map(p => p.cat))];
    const lista = db.productos.filter(p => filtro == 'Todos' || p.cat == filtro);
    const ids = Object.keys(cart).filter(id => db.productos.some(p => p.id == id)), total = ids.reduce((s, id) => s + cart[id] * db.productos.find(p => p.id == id).precio, 0);
    return `<h3>Menú de hoy</h3><div class="cols"><div>
      <div class="chips bar">${cats.map(c => `<button class="${c == filtro ? 'on' : ''}" data-a="filtro" data-id="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="grid">${lista.map(p => `<div class="card prod"><b>${esc(p.nombre)}</b><small>${esc(p.cat)}</small><p class="desc">${esc(p.desc)}</p><span class="price">${money(p.precio)}</span>
        ${p.stock > 0 ? `<button data-a="add" data-id="${p.id}">Agregar</button>` : '<span class="tag low">Agotado</span>'}</div>`).join('')}</div></div>
      <div class="card"><b>Tu pedido</b>${ids.length ? ids.map(id => { const p = db.productos.find(x => x.id == id); return `<div class="line"><span>${cart[id]} × ${esc(p.nombre)}</span>
        <button class="sm ghost" style="color:var(--ink)" data-a="quitar" data-id="${id}">Quitar</button></div>`; }).join('') : '<p class="empty">Agrega productos del menú para armar tu pedido.</p>'}
        <div class="total"><span>Total</span><span>${money(total)}</span></div>
        <button data-a="pedir" ${ids.length ? '' : 'disabled'} style="width:100%">Hacer pedido</button></div></div>`;
  },
  mis() {
    const l = [...db.pedidos].reverse();
    return `<h3>Mis pedidos</h3>` + (l.length ? l.map(p => `<div class="card" style="margin-bottom:.7rem"><div class="bar" style="margin:0"><b>Pedido #${p.id}</b><span class="tag ${p.estado}">${p.estado}</span></div>
      ${p.items.map(i => `<div>${i.qty} × ${esc(i.nombre)}</div>`).join('')}<b>${money(p.total)}</b></div>`).join('') : '<p class="empty">Aún no has hecho pedidos. Ve al menú para empezar.</p>');
  },
  cocina() {
    return `<h3>Pedidos en cocina</h3><div class="kanban">${['Pendiente','Preparando','Listo'].map(e => {
      const l = db.pedidos.filter(p => p.estado == e);
      return `<div><h4>${e} (${l.length})</h4>${l.map(p => `<div class="card"><b>#${p.id} · ${esc(p.cliente)}</b>
        ${p.items.map(i => `<span>${i.qty} × ${esc(i.nombre)}</span>`).join('')}<button class="sm" data-a="avanzar" data-id="${p.id}">${BTN[e]}</button></div>`).join('') || '<p class="empty">Sin pedidos</p>'}</div>`;
    }).join('')}</div>`;
  },
  dash() {
    const v = ventas(), tot = v.reduce((s, p) => s + p.total, 0), act = db.pedidos.filter(p => p.estado != 'Entregado').length;
    const bajos = db.productos.filter(p => p.stock <= p.min).length, cnt = {};
    v.forEach(p => p.items.forEach(i => cnt[i.nombre] = (cnt[i.nombre] || 0) + i.qty));
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5), max = top[0]?.[1] || 1;
    return `<h3>Dashboard</h3><div class="stats">
      <div class="card stat"><b>${money(tot)}</b><span>Ventas entregadas</span></div>
      <div class="card stat"><b>${act}</b><span>Pedidos activos</span></div>
      <div class="card stat"><b>${bajos}</b><span>Productos con stock bajo</span></div></div>
      <div class="card"><b>Lo más vendido</b><div class="bars" style="margin-top:.8rem">${top.map(([n, c]) => `<div><span>${esc(n)}</span><i style="width:${c / max * 100}%"></i><span>${c}</span></div>`).join('') || '<p class="empty">Todavía no hay ventas.</p>'}</div></div>`;
  },
  productos() {
    return `<div class="bar"><h3 style="margin:0">Productos</h3><button data-a="nuevoProd">Nuevo producto</button></div><div class="scroll"><table>
      <tr><th>Nombre</th><th>Categoría</th><th>Descripción</th><th>Precio</th><th></th></tr>
      ${db.productos.map(p => `<tr><td>${esc(p.nombre)}</td><td>${esc(p.cat)}</td><td>${esc(p.desc)}</td><td>${money(p.precio)}</td><td>
        <button class="sm" data-a="editProd" data-id="${p.id}">Editar</button> <button class="sm danger" data-a="delProd" data-id="${p.id}">Eliminar</button></td></tr>`).join('')}</table></div>`;
  },
  inventario() {
    return `<h3>Inventario</h3><div class="scroll"><table><tr><th>Producto</th><th>Stock</th><th>Mínimo</th><th>Estado</th><th>Ajustar</th></tr>
      ${db.productos.map(p => `<tr><td>${esc(p.nombre)}</td><td>${p.stock}</td><td>${p.min}</td>
        <td><span class="tag ${p.stock <= p.min ? 'low' : ''}">${p.stock <= p.min ? 'Reponer' : 'Suficiente'}</span></td>
        <td><button class="sm" data-a="stock" data-id="${p.id}" data-d="-5">−5</button> <button class="sm" data-a="stock" data-id="${p.id}" data-d="10">+10</button></td></tr>`).join('')}</table></div>`;
  },
  pedidos() {
    return `<h3>Todos los pedidos</h3><div class="scroll"><table><tr><th>#</th><th>Cliente</th><th>Detalle</th><th>Total</th><th>Estado</th></tr>
      ${[...db.pedidos].reverse().map(p => `<tr><td>${p.id}</td><td>${esc(p.cliente)}</td><td>${p.items.map(i => esc(i.qty + ' × ' + i.nombre)).join(', ')}</td><td>${money(p.total)}</td><td><span class="tag ${p.estado}">${p.estado}</span></td></tr>`).join('')}</table></div>`;
  },
  ventas() {
    const v = ventas();
    return `<div class="bar"><h3 style="margin:0">Ventas y reportes</h3><button data-a="csv">Descargar reporte CSV</button></div>
      <p class="total"><span>Total vendido</span><span>${money(v.reduce((s, p) => s + p.total, 0))}</span></p><div class="scroll"><table><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Total</th></tr>
      ${v.map(p => `<tr><td>${p.id}</td><td>${new Date(p.fecha).toLocaleDateString('es-CO')}</td><td>${esc(p.cliente)}</td><td>${money(p.total)}</td></tr>`).join('') || '<tr><td colspan="4">Sin ventas todavía.</td></tr>'}</table></div>`;
  },
  usuarios() {
    return `<div class="bar"><h3 style="margin:0">Usuarios</h3><button data-a="nuevoUser">Nuevo usuario</button></div><div class="scroll"><table><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th></th></tr>
      ${db.usuarios.map(u => `<tr><td>${esc(u.nombre)}</td><td>${esc(u.email)}</td><td><span class="tag">${esc(u.rol)}</span></td><td>${u.id == user.id ? '' : `<button class="sm danger" data-a="delUser" data-id="${u.id}">Eliminar</button>`}</td></tr>`).join('')}</table></div>`;
  }
};

function render() {
  if (!user) return;
  $('#nav').innerHTML = NAV[user.rol].map(([k, t]) => `<button class="${k == vista ? 'on' : ''}" data-a="go" data-id="${k}">${t}</button>`).join('');
  $('#quien').textContent = `${user.nombre} · ${user.rol}`;
  $('#view').innerHTML = V[vista]();
}

const campoProd = p => [{k:'nombre',l:'Nombre',v:p.nombre},{k:'cat',l:'Categoría',o:['Almuerzos','Snacks','Bebidas','Postres'],v:p.cat},
  {k:'desc',l:'Descripción',v:p.desc},
  {k:'precio',l:'Precio',t:'number',v:p.precio},{k:'stock',l:'Stock actual',t:'number',v:p.stock},{k:'min',l:'Stock mínimo',t:'number',v:p.min}];
const num = o => ({...o, precio:+o.precio, stock:+o.stock, min:+o.min});
const refrescar = async () => { await cargar(); render(); };
const A = {
  salir: async () => { try { await api('POST', '/api/logout'); } catch { } mostrarLogin(); },
  go: id => { vista = id; render(); },
  filtro: id => { filtro = id; render(); },
  add: id => { const p = db.productos.find(x => x.id == id); if ((cart[id] || 0) >= p.stock) return toast('No hay más unidades disponibles'); cart[id] = (cart[id] || 0) + 1; render(); },
  quitar: id => { if (--cart[id] <= 0) delete cart[id]; render(); },
  pedir: async () => {
    try {
      await api('POST', '/api/pedidos', {items: Object.keys(cart).map(id => ({id: +id, qty: cart[id]}))});
      cart = {}; vista = 'mis'; await refrescar(); toast('Pedido enviado a cocina');
    } catch (e) { toast(e.message); await refrescar(); }
  },
  avanzar: async id => { await api('POST', `/api/pedidos/${id}/avanzar`); await refrescar(); },
  nuevoProd: () => form('Nuevo producto', campoProd({nombre:'',cat:'Almuerzos',precio:'',stock:'',min:''}), o => api('POST', '/api/productos', num(o))),
  editProd: id => { const p = db.productos.find(x => x.id == id); form('Editar producto', campoProd(p), o => api('PUT', `/api/productos/${id}`, num(o))); },
  delProd: async id => { if (confirm('¿Eliminar este producto?')) { await api('DELETE', `/api/productos/${id}`); await refrescar(); } },
  stock: async (id, b) => { await api('POST', `/api/productos/${id}/stock`, {delta: +b.dataset.d}); await refrescar(); },
  nuevoUser: () => form('Nuevo usuario', [{k:'nombre',l:'Nombre'},{k:'email',l:'Correo',t:'email'},{k:'password',l:'Contraseña (mínimo 8 caracteres)',t:'password'},{k:'rol',l:'Rol',o:['cliente','cocina','admin']}], o => api('POST', '/api/usuarios', o)),
  delUser: async id => { if (confirm('¿Eliminar este usuario?')) { await api('DELETE', `/api/usuarios/${id}`); await refrescar(); } },
  csv: () => {
    const q = t => '"' + (/^[=+\-@]/.test(t) ? "'" + t : t).replace(/"/g, '""') + '"'; // evita fórmulas en Excel
    const f = ['Pedido,Fecha,Cliente,Total', ...ventas().map(p => `${p.id},${p.fecha.slice(0,10)},${q(p.cliente)},${p.total}`)].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f], {type:'text/csv'})); a.download = 'ventas.csv'; a.click();
  }
};
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-a]');
  if (b) try { await A[b.dataset.a]?.(b.dataset.id, b); } catch (err) { toast(err.message); }
});

// ---------- login / registro ----------
const loginErr = t => { $('#loginErr').textContent = t || ''; };
function mostrarLogin() {
  user = null; cart = {}; db = {productos: [], pedidos: [], usuarios: []};
  $('#app').hidden = true; $('#login').hidden = false;
  $('#fLogin').reset(); $('#fReg').reset(); loginErr();
}
async function entrar(u) {
  user = u; vista = NAV[u.rol][0][0];
  await cargar();
  $('#login').hidden = true; $('#app').hidden = false; render();
}
function enviar(form, url) {
  form.onsubmit = async e => {
    e.preventDefault(); loginErr();
    const btn = form.querySelector('button'); btn.disabled = true;
    try { await entrar(await api('POST', url, Object.fromEntries(new FormData(form)))); }
    catch (err) { loginErr(err.message); }
    finally { btn.disabled = false; }
  };
}
enviar($('#fLogin'), '/api/login');
enviar($('#fReg'), '/api/registro');
$('#alt').onclick = () => {
  const reg = $('#fReg').hidden; loginErr();
  $('#fReg').hidden = !reg; $('#fLogin').hidden = reg;
  $('#alt').textContent = reg ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate';
};

// Actualiza los datos cada 15 s (p. ej. pedidos nuevos en cocina)
setInterval(() => { if (user && !dlg.open) refrescar().catch(() => { }); }, 15000);

// Al abrir la página: ¿ya hay sesión?
api('GET', '/api/me').then(entrar).catch(mostrarLogin);
