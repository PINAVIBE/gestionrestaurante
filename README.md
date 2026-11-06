# Comedor Universitario – Sistema de pedidos

Plataforma web (Node.js + Express + SQLite) para gestionar pedidos, productos, inventario, usuarios, ventas y reportes.

## Ejecutar
```
npm install
npm start
```
Abre http://localhost:3000 (ya NO se abre index.html directo: ahora hay servidor).
Requiere Node.js 18 o superior. La base de datos se crea sola en `data/comedor.db`.
Para reiniciarla desde cero, detén el servidor y borra la carpeta `data/`.

## Usuarios de prueba
| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@universidad.edu | admin123 |
| Cocina | cocina@universidad.edu | cocina123 |
| Estudiante | laura@universidad.edu | laura1234 |

Los estudiantes pueden crear su cuenta desde la pantalla de login (siempre con rol `cliente`).
Solo el administrador crea usuarios de cocina o admin.

## Base de datos (SQLite)
`usuarios` · `productos` · `pedidos` · `pedido_items` · `sesiones`

## Seguridad implementada
- Contraseñas guardadas con bcrypt (nunca en texto plano).
- Sesión con cookie `httpOnly`; en la BD solo se guarda el hash del token.
- Permisos por rol validados en el servidor (no solo ocultando botones).
- El total y los precios de un pedido los calcula el servidor; el stock se descuenta en una transacción.
- Bloqueo temporal tras 8 intentos de login fallidos.
- Texto de usuarios escapado en pantalla (evita XSS).
