// ===== Datos (por ahora en localStorage; luego se cambia por la base de datos) =====
const K = 'comedor_db';
const hoy = () => new Date().toISOString();
const seed = () => ({
  productos: [
    {id:1,nombre:'Almuerzo ejecutivo',cat:'Almuerzos',desc:'Porción de arroz, 200 g de carne, ensalada y una gaseosa de 200 ml',precio:12000,stock:40,min:10},
    {id:2,nombre:'Arroz con pollo',cat:'Almuerzos',desc:'Arroz con presas de pollo y verduras, acompañado de ensalada',precio:11000,stock:30,min:10},
    {id:3,nombre:'Empanada',cat:'Snacks',desc:'Empanada de maíz frita, rellena de carne y papa',precio:2500,stock:60,min:20},
    {id:4,nombre:'Jugo natural',cat:'Bebidas',desc:'Jugo de fruta de temporada preparado al momento, vaso de 12 oz',precio:3500,stock:8,min:15},
    {id:5,nombre:'Gaseosa',cat:'Bebidas',desc:'Gaseosa de 350 ml, bien fría',precio:3000,stock:50,min:20},
    {id:6,nombre:'Ensalada de frutas',cat:'Postres',desc:'Mezcla de frutas frescas de temporada con un toque de miel',precio:4000,stock:18,min:8}],
  pedidos: [
    {id:1,cliente:'Laura Pérez',items:[{id:1,nombre:'Almuerzo ejecutivo',precio:12000,qty:2}],total:24000,estado:'Entregado',fecha:hoy()},
    {id:2,cliente:'Carlos Ruiz',items:[{id:3,nombre:'Empanada',precio:2500,qty:3},{id:5,nombre:'Gaseosa',precio:3000,qty:1}],total:10500,estado:'Entregado',fecha:hoy()}],
  usuarios: [
    {id:1,nombre:'Administrador',email:'admin@universidad.edu',rol:'admin'},
    {id:2,nombre:'Marta Gómez',email:'cocina@universidad.edu',rol:'cocina'},
    {id:3,nombre:'Laura Pérez',email:'laura@universidad.edu',rol:'cliente'}]
});
let db; try { db = JSON.parse(localStorage.getItem(K)); } catch { }
db = db || seed();
const base = seed();
db.productos.forEach(p => {
  if (p.desc === undefined) {
    const b = base.productos.find(x => x.id == p.id);
    p.desc = b ? b.desc : '';
    if (b) p.cat = b.cat;
  }
});
const save = () => { try { localStorage.setItem(K, JSON.stringify(db)); } catch { } };
const nextId = arr => Math.max(0, ...arr.map(x => x.id)) + 1;

// ===== Estado y utilidades =====
let user = null, vista = '', cart = {}, filtro = 'Todos';
const $ = s => document.querySelector(s);
const money = n => '$' + n.toLocaleString('es-CO');
const NAV = {
  cliente: [['menu','Menú'],['mis','Mis pedidos']],
  cocina: [['cocina','Pedidos en cocina']],
  admin: [['dash','Dashboard'],['productos','Productos'],['inventario','Inventario'],['pedidos','Pedidos'],['ventas','Ventas y reportes'],['usuarios','Usuarios']]
};
const NOMBRES = {cliente:'Laura Pérez', cocina:'Marta Gómez', admin:'Administrador'};
const SIG = {Pendiente:'Preparando', Preparando:'Listo', Listo:'Entregado'};
const BTN = {Pendiente:'Empezar a preparar', Preparando:'Marcar como listo', Listo:'Entregar'};
const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2200); };
const ventas = () => db.pedidos.filter(p => p.estado === 'Entregado');

function form(titulo, campos, cb) {
  $('#frm').innerHTML = `<h3>${titulo}</h3>` + campos.map(c => `<label>${c.l}${c.o
    ? `<select name="${c.k}">${c.o.map(o => `<option ${o == c.v ? 'selected' : ''}>${o}</option>`).join('')}</select>`
    : `<input name="${c.k}" type="${c.t || 'text'}" value="${c.v ?? ''}" required>`}</label>`).join('')
    + `<div class="acts"><button type="button" class="ghost" onclick="dlg.close()">Cancelar</button><button>Guardar</button></div>`;
  $('#frm').onsubmit = e => { e.preventDefault(); cb(Object.fromEntries(new FormData(e.target))); dlg.close(); save(); render(); };
  dlg.showModal();
}

// ===== Vistas =====
const V = {
  menu() {
    const cats = ['Todos', ...new Set(db.productos.map(p => p.cat))];
    const lista = db.productos.filter(p => filtro == 'Todos' || p.cat == filtro);
    const ids = Object.keys(cart), total = ids.reduce((s, id) => s + cart[id] * db.productos.find(p => p.id == id).precio, 0);
    return `<h3>Menú de hoy</h3><div class="cols"><div>
      <div class="chips bar">${cats.map(c => `<button class="${c == filtro ? 'on' : ''}" data-a="filtro" data-id="${c}">${c}</button>`).join('')}</div>
      <div class="grid">${lista.map(p => `<div class="card prod"><b>${p.nombre}</b><small>${p.cat}</small><p class="desc">${p.desc || ''}</p><span class="price">${money(p.precio)}</span>
        ${p.stock > 0 ? `<button data-a="add" data-id="${p.id}">Agregar</button>` : '<span class="tag low">Agotado</span>'}</div>`).join('')}</div></div>
      <div class="card"><b>Tu pedido</b>${ids.length ? ids.map(id => { const p = db.productos.find(x => x.id == id); return `<div class="line"><span>${cart[id]} × ${p.nombre}</span>
        <button class="sm ghost" style="color:var(--ink)" data-a="quitar" data-id="${id}">Quitar</button></div>`; }).join('') : '<p class="empty">Agrega productos del menú para armar tu pedido.</p>'}
        <div class="total"><span>Total</span><span>${money(total)}</span></div>
        <button data-a="pedir" ${ids.length ? '' : 'disabled'} style="width:100%">Hacer pedido</button></div></div>`;
  },
  mis() {
    const l = db.pedidos.filter(p => p.cliente == user.nombre).reverse();
    return `<h3>Mis pedidos</h3>` + (l.length ? l.map(p => `<div class="card" style="margin-bottom:.7rem"><div class="bar" style="margin:0"><b>Pedido #${p.id}</b><span class="tag ${p.estado}">${p.estado}</span></div>
      ${p.items.map(i => `<div>${i.qty} × ${i.nombre}</div>`).join('')}<b>${money(p.total)}</b></div>`).join('') : '<p class="empty">Aún no has hecho pedidos. Ve al menú para empezar.</p>');
  },
  cocina() {
    return `<h3>Pedidos en cocina</h3><div class="kanban">${['Pendiente','Preparando','Listo'].map(e => {
      const l = db.pedidos.filter(p => p.estado == e);
      return `<div><h4>${e} (${l.length})</h4>${l.map(p => `<div class="card"><b>#${p.id} · ${p.cliente}</b>
        ${p.items.map(i => `<span>${i.qty} × ${i.nombre}</span>`).join('')}<button class="sm" data-a="avanzar" data-id="${p.id}">${BTN[e]}</button></div>`).join('') || '<p class="empty">Sin pedidos</p>'}</div>`;
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
      <div class="card"><b>Lo más vendido</b><div class="bars" style="margin-top:.8rem">${top.map(([n, c]) => `<div><span>${n}</span><i style="width:${c / max * 100}%"></i><span>${c}</span></div>`).join('') || '<p class="empty">Todavía no hay ventas.</p>'}</div></div>`;
  },
  productos() {
    return `<div class="bar"><h3 style="margin:0">Productos</h3><button data-a="nuevoProd">Nuevo producto</button></div><div class="scroll"><table>
      <tr><th>Nombre</th><th>Categoría</th><th>Descripción</th><th>Precio</th><th></th></tr>
      ${db.productos.map(p => `<tr><td>${p.nombre}</td><td>${p.cat}</td><td>${p.desc || ''}</td><td>${money(p.precio)}</td><td>
        <button class="sm" data-a="editProd" data-id="${p.id}">Editar</button> <button class="sm danger" data-a="delProd" data-id="${p.id}">Eliminar</button></td></tr>`).join('')}</table></div>`;
  },
  inventario() {
    return `<h3>Inventario</h3><div class="scroll"><table><tr><th>Producto</th><th>Stock</th><th>Mínimo</th><th>Estado</th><th>Ajustar</th></tr>
      ${db.productos.map(p => `<tr><td>${p.nombre}</td><td>${p.stock}</td><td>${p.min}</td>
        <td><span class="tag ${p.stock <= p.min ? 'low' : ''}">${p.stock <= p.min ? 'Reponer' : 'Suficiente'}</span></td>
        <td><button class="sm" data-a="stock" data-id="${p.id}" data-d="-5">−5</button> <button class="sm" data-a="stock" data-id="${p.id}" data-d="10">+10</button></td></tr>`).join('')}</table></div>`;
  },
  pedidos() {
    return `<h3>Todos los pedidos</h3><div class="scroll"><table><tr><th>#</th><th>Cliente</th><th>Detalle</th><th>Total</th><th>Estado</th></tr>
      ${[...db.pedidos].reverse().map(p => `<tr><td>${p.id}</td><td>${p.cliente}</td><td>${p.items.map(i => i.qty + ' × ' + i.nombre).join(', ')}</td><td>${money(p.total)}</td><td><span class="tag ${p.estado}">${p.estado}</span></td></tr>`).join('')}</table></div>`;
  },
  ventas() {
    const v = ventas();
    return `<div class="bar"><h3 style="margin:0">Ventas y reportes</h3><button data-a="csv">Descargar reporte CSV</button></div>
      <p class="total"><span>Total vendido</span><span>${money(v.reduce((s, p) => s + p.total, 0))}</span></p><div class="scroll"><table><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Total</th></tr>
      ${v.map(p => `<tr><td>${p.id}</td><td>${new Date(p.fecha).toLocaleDateString('es-CO')}</td><td>${p.cliente}</td><td>${money(p.total)}</td></tr>`).join('') || '<tr><td colspan="4">Sin ventas todavía.</td></tr>'}</table></div>`;
  },
  usuarios() {
    return `<div class="bar"><h3 style="margin:0">Usuarios</h3><button data-a="nuevoUser">Nuevo usuario</button></div><div class="scroll"><table><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th></th></tr>
      ${db.usuarios.map(u => `<tr><td>${u.nombre}</td><td>${u.email}</td><td><span class="tag">${u.rol}</span></td><td><button class="sm danger" data-a="delUser" data-id="${u.id}">Eliminar</button></td></tr>`).join('')}</table></div>`;
  }
};

function render() {
  if (!user) return;
  $('#nav').innerHTML = NAV[user.rol].map(([k, t]) => `<button class="${k == vista ? 'on' : ''}" data-a="go" data-id="${k}">${t}</button>`).join('');
  $('#quien').textContent = `${user.nombre} · ${user.rol}`;
  $('#view').innerHTML = V[vista]();
}

// ===== Acciones =====
const campoProd = p => [{k:'nombre',l:'Nombre',v:p.nombre},{k:'cat',l:'Categoría',o:['Almuerzos','Snacks','Bebidas','Postres'],v:p.cat},
  {k:'desc',l:'Descripción',v:p.desc},
  {k:'precio',l:'Precio',t:'number',v:p.precio},{k:'stock',l:'Stock actual',t:'number',v:p.stock},{k:'min',l:'Stock mínimo',t:'number',v:p.min}];
const num = o => ({...o, precio:+o.precio, stock:+o.stock, min:+o.min});
const A = {
  rol: r => { user = {rol:r, nombre:NOMBRES[r]}; vista = NAV[r][0][0]; $('#login').hidden = true; $('#app').hidden = false; render(); },
  salir: () => { user = null; cart = {}; $('#app').hidden = true; $('#login').hidden = false; },
  go: id => { vista = id; render(); },
  filtro: id => { filtro = id; render(); },
  add: id => { const p = db.productos.find(x => x.id == id); if ((cart[id] || 0) >= p.stock) return toast('No hay más unidades disponibles'); cart[id] = (cart[id] || 0) + 1; render(); },
  quitar: id => { if (--cart[id] <= 0) delete cart[id]; render(); },
  pedir: () => {
    const items = Object.keys(cart).map(id => { const p = db.productos.find(x => x.id == id); return {id:p.id, nombre:p.nombre, precio:p.precio, qty:cart[id]}; });
    items.forEach(i => db.productos.find(p => p.id == i.id).stock -= i.qty);
    db.pedidos.push({id:nextId(db.pedidos), cliente:user.nombre, items, total:items.reduce((s, i) => s + i.precio * i.qty, 0), estado:'Pendiente', fecha:hoy()});
    cart = {}; save(); vista = 'mis'; render(); toast('Pedido enviado a cocina');
  },
  avanzar: id => { const p = db.pedidos.find(x => x.id == id); p.estado = SIG[p.estado]; save(); render(); },
  nuevoProd: () => form('Nuevo producto', campoProd({nombre:'',cat:'Almuerzos',precio:'',stock:'',min:''}), o => db.productos.push({id:nextId(db.productos), ...num(o)})),
  editProd: id => { const p = db.productos.find(x => x.id == id); form('Editar producto', campoProd(p), o => Object.assign(p, num(o))); },
  delProd: id => { if (confirm('¿Eliminar este producto?')) { db.productos = db.productos.filter(p => p.id != id); save(); render(); } },
  stock: (id, b) => { const p = db.productos.find(x => x.id == id); p.stock = Math.max(0, p.stock + +b.dataset.d); save(); render(); },
  nuevoUser: () => form('Nuevo usuario', [{k:'nombre',l:'Nombre'},{k:'email',l:'Correo',t:'email'},{k:'rol',l:'Rol',o:['cliente','cocina','admin']}], o => db.usuarios.push({id:nextId(db.usuarios), ...o})),
  delUser: id => { if (confirm('¿Eliminar este usuario?')) { db.usuarios = db.usuarios.filter(u => u.id != id); save(); render(); } },
  csv: () => {
    const f = ['Pedido,Fecha,Cliente,Total', ...ventas().map(p => `${p.id},${p.fecha.slice(0,10)},"${p.cliente}",${p.total}`)].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f], {type:'text/csv'})); a.download = 'ventas.csv'; a.click();
  }
};
document.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) A[b.dataset.a]?.(b.dataset.id, b); });
