// Base de datos SQLite: esquema + datos iniciales.
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dir = path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });

const db = new Database(path.join(dir, 'comedor.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('cliente','cocina','admin')),
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS productos (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  cat    TEXT NOT NULL,
  desc   TEXT NOT NULL DEFAULT '',
  precio INTEGER NOT NULL CHECK (precio >= 0),
  stock  INTEGER NOT NULL CHECK (stock >= 0),
  min    INTEGER NOT NULL CHECK (min >= 0)
);

CREATE TABLE IF NOT EXISTS pedidos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  cliente    TEXT NOT NULL,
  total      INTEGER NOT NULL,
  estado     TEXT NOT NULL DEFAULT 'Pendiente'
             CHECK (estado IN ('Pendiente','Preparando','Listo','Entregado')),
  fecha      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pedido_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id   INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  nombre      TEXT NOT NULL,
  precio      INTEGER NOT NULL,
  qty         INTEGER NOT NULL CHECK (qty > 0)
);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira     INTEGER NOT NULL
);
`);

// ---- Datos iniciales (solo si las tablas están vacías) ----
const vacio = t => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n === 0;

if (vacio('usuarios')) {
  const ins = db.prepare('INSERT INTO usuarios (nombre,email,password_hash,rol) VALUES (?,?,?,?)');
  [
    ['Administrador', 'admin@universidad.edu', 'admin123', 'admin'],
    ['Marta Gómez', 'cocina@universidad.edu', 'cocina123', 'cocina'],
    ['Laura Pérez', 'laura@universidad.edu', 'laura1234', 'cliente'],
  ].forEach(([n, e, p, r]) => ins.run(n, e, bcrypt.hashSync(p, 10), r));
}

if (vacio('productos')) {
  const ins = db.prepare('INSERT INTO productos (nombre,cat,desc,precio,stock,min) VALUES (?,?,?,?,?,?)');
  [
    ['Almuerzo ejecutivo', 'Almuerzos', 'Porción de arroz, 200 g de carne, ensalada y una gaseosa de 200 ml', 12000, 40, 10],
    ['Arroz con pollo', 'Almuerzos', 'Arroz con presas de pollo y verduras, acompañado de ensalada', 11000, 30, 10],
    ['Empanada', 'Snacks', 'Empanada de maíz frita, rellena de carne y papa', 2500, 60, 20],
    ['Jugo natural', 'Bebidas', 'Jugo de fruta de temporada preparado al momento, vaso de 12 oz', 3500, 8, 15],
    ['Gaseosa', 'Bebidas', 'Gaseosa de 350 ml, bien fría', 3000, 50, 20],
    ['Ensalada de frutas', 'Postres', 'Mezcla de frutas frescas de temporada con un toque de miel', 4000, 18, 8],
  ].forEach(r => ins.run(...r));
}

if (vacio('pedidos')) {
  const laura = db.prepare("SELECT id FROM usuarios WHERE email='laura@universidad.edu'").get().id;
  const p = db.prepare('INSERT INTO pedidos (usuario_id,cliente,total,estado,fecha) VALUES (?,?,?,?,?)');
  const i = db.prepare('INSERT INTO pedido_items (pedido_id,producto_id,nombre,precio,qty) VALUES (?,?,?,?,?)');
  const f = new Date().toISOString();
  let id = p.run(laura, 'Laura Pérez', 24000, 'Entregado', f).lastInsertRowid;
  i.run(id, 1, 'Almuerzo ejecutivo', 12000, 2);
  id = p.run(null, 'Carlos Ruiz', 10500, 'Entregado', f).lastInsertRowid;
  i.run(id, 3, 'Empanada', 2500, 3);
  i.run(id, 5, 'Gaseosa', 3000, 1);
}

module.exports = db;
