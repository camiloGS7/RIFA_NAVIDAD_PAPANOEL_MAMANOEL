# Gran Rifa Papá y Mamá Noel — Sistema de Registro de Ventas

Aplicación web para administrar la venta de un talonario de 100 números (`01` a `99` y `00`). Permite registrar a cada comprador con su nombre y teléfono de contacto, consultar la lista de compradores, corregir o anular ventas y, el día del sorteo, identificar al ganador y comunicarse con él por llamada o WhatsApp.

La interfaz está diseñada para ser utilizada sin capacitación previa por personas de cualquier edad: texto amplio, controles de gran tamaño, alto contraste y mensajes en lenguaje sencillo.

---

## Información de la rifa

| Concepto | Detalle |
|---|---|
| Premio | Pareja de muñecos de Papá Noel y Mamá Noel |
| Valor del boleto | $10.000 COP (configurable mediante `PRECIO_BOLETO`) |
| Fecha del sorteo | 12 de diciembre |
| Mecánica | Últimas dos cifras del premio mayor de la Lotería de Boyacá |

---

## Funcionalidades

- **Talonario interactivo.** Cuadrícula de 100 números con tres estados visibles: libre, vendido y pagado, y vendido con pago pendiente. Cada estado se distingue por color e icono. Al seleccionar un número libre se abre un formulario con *Nombre completo*, *Teléfono celular* y la indicación de si el comprador *ya pagó* o *queda debiendo*; los tres datos son obligatorios.
- **Detalle de venta.** Al seleccionar un número vendido se muestran el comprador, el teléfono, el estado de pago y la fecha de venta, con accesos directos para llamar o escribir por WhatsApp.
- **Control de pagos.** Desde el detalle de cada número puede marcarse el boleto como pagado o pendiente con un solo botón. El resumen distingue el dinero recogido del dinero por cobrar.
- **Corrección y anulación.** Los datos de un comprador pueden corregirse; una venta puede anularse previa confirmación explícita, dejando el número disponible.
- **Lista de compradores.** Búsqueda por nombre, número o teléfono, filtro por estado de pago (todos, ya pagaron, deben) y descarga de la lista completa en formato CSV compatible con Excel.
- **Consulta del ganador.** Al ingresar las dos cifras ganadoras se muestra el comprador correspondiente, su estado de pago y opciones de contacto inmediato y un mensaje de felicitación prellenado para WhatsApp.
- **Resumen de ventas.** Números vendidos y disponibles, dinero recogido y dinero pendiente de cobro, con barra de progreso.
- **Imagen para historias de Instagram.** Genera un PNG de 1080 × 1920 px con el estado del talonario, respetando los márgenes superior e inferior que ocupa la interfaz de Instagram. No incluye datos de los compradores.
- **Trabajo simultáneo.** La venta se registra mediante una operación atómica en la base de datos, de modo que dos vendedores no pueden vender el mismo número. La vista se actualiza automáticamente cada 20 segundos.
- **Acceso protegido (opcional).** Si se define `ADMIN_PIN`, la aplicación solicita el PIN una vez por dispositivo y la API rechaza cualquier solicitud que no lo incluya. Esto protege los nombres y teléfonos de los compradores.

---

## Arquitectura

| Capa | Tecnología |
|---|---|
| Servidor | Node.js 18 o superior, Express 4 |
| Base de datos | PostgreSQL alojado en Neon DB (driver `pg`, conexión TLS) |
| Cliente | HTML, CSS y JavaScript sin frameworks ni dependencias de compilación |
| Despliegue | Railway (Nixpacks) con verificación de salud en `/api/health` |

### Estructura del proyecto

```text
.
├── server.js            Punto de entrada: configuración HTTP, rutas de la API y arranque
├── lib/
│   ├── db.js            Pool de conexiones, migraciones y consultas SQL
│   └── validacion.js    Validación y normalización de datos de entrada
├── db/
│   └── init.sql         Esquema de referencia para aprovisionamiento manual
├── public/
│   ├── rifa.config.js   Datos de la rifa: títulos, premio, foto, fecha y lotería
│   ├── index.html       Estructura de la interfaz
│   ├── styles.css       Estilos y sistema visual
│   ├── app.js           Lógica del cliente y consumo de la API
│   └── img/             Recursos gráficos
├── docs/
│   └── NUEVA-RIFA.md    Guía y prompt para montar otra rifa con el mismo diseño
├── .env.example         Plantilla de variables de entorno
├── railway.json         Configuración de construcción y despliegue en Railway
├── Procfile             Definición del proceso web
└── package.json
```

---

## Modelo de datos

Tabla `boletos_rifa`:

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `SERIAL` | Clave primaria |
| `numero` | `VARCHAR(2)` único | Número del boleto (`00` a `99`) |
| `nombre_comprador` | `VARCHAR(150)` | Nombre del comprador; `NULL` si está disponible |
| `telefono` | `VARCHAR(20)` | Teléfono del comprador, almacenado solo con dígitos |
| `estado` | `BOOLEAN` | `FALSE` disponible, `TRUE` vendido |
| `pagado` | `BOOLEAN` | `TRUE` cuando el comprador ya pagó el boleto |
| `fecha_venta` | `TIMESTAMPTZ` | Fecha y hora del registro de la venta |

Al iniciar, el servidor crea la tabla si no existe, agrega las columnas `telefono` y `pagado` en instalaciones anteriores e inserta los 100 números faltantes. Todas las operaciones son idempotentes y no alteran las ventas registradas. El archivo `db/init.sql` contiene el mismo esquema para quien prefiera aprovisionar la base manualmente desde la consola de Neon.

---

## API REST

Todas las respuestas son JSON con el campo `ok`. Cuando `ADMIN_PIN` está definido, las rutas bajo `/api/boletos` exigen la cabecera `X-Admin-Pin`.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado del servicio y de la conexión a la base de datos |
| `GET` | `/api/config` | Precio del boleto e indicador de si se requiere PIN |
| `POST` | `/api/sesion` | Verifica un PIN. Cuerpo: `{ "pin": "1234" }` |
| `GET` | `/api/boletos` | Lista de los 100 boletos y resumen de ventas |
| `GET` | `/api/boletos/exportar` | Compradores en formato CSV |
| `POST` | `/api/boletos/:numero/venta` | Registra una venta. Cuerpo: `{ "nombre": "...", "telefono": "...", "pagado": true }` |
| `PUT` | `/api/boletos/:numero/venta` | Corrige nombre, teléfono o estado de pago de un boleto vendido |
| `PATCH` | `/api/boletos/:numero/pago` | Marca el boleto como pagado o pendiente. Cuerpo: `{ "pagado": true }` |
| `DELETE` | `/api/boletos/:numero/venta` | Anula la venta y libera el número |

### Validaciones

- `numero`: exactamente dos dígitos.
- `nombre`: entre 3 y 100 caracteres; se eliminan espacios redundantes y caracteres de control.
- `telefono`: entre 7 y 15 dígitos; se aceptan espacios, guiones y prefijo `+57`, y se almacenan únicamente los dígitos.
- `pagado`: valor booleano obligatorio al registrar o corregir una venta.

### Códigos de respuesta

| Código | Significado |
|---|---|
| `200` / `201` | Operación exitosa |
| `400` | Datos inválidos; el campo `errores` detalla el problema por campo |
| `401` | PIN ausente o incorrecto |
| `404` | El boleto no existe o no está vendido |
| `409` | El número ya fue vendido |
| `503` | Base de datos no configurada |

---

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión de Neon DB |
| `ADMIN_PIN` | Recomendada | PIN de acceso para vendedores. Si no se define, cualquier persona con la URL puede ver y modificar las ventas |
| `PRECIO_BOLETO` | No | Valor del boleto en pesos. Por defecto `10000` |
| `NOMBRE_TABLA` | No | Tabla de la base de datos. Por defecto `boletos_rifa`. Permite que varias rifas compartan una misma base de datos sin mezclar información |
| `PORT` | No | Puerto HTTP. Railway lo asigna automáticamente |

---

## Ejecución local

```bash
git clone https://github.com/camiloGS7/RIFA_NAVIDAD_PAPANOEL_MAMANOEL.git
cd RIFA_NAVIDAD_PAPANOEL_MAMANOEL
npm install
cp .env.example .env    # completar DATABASE_URL y, opcionalmente, ADMIN_PIN
npm start
```

La aplicación queda disponible en `http://localhost:3000`.

---

## Despliegue en Railway

1. Vincular el servicio de Railway al repositorio `camiloGS7/RIFA_NAVIDAD_PAPANOEL_MAMANOEL`, rama `main`.
2. Definir en **Variables** al menos `DATABASE_URL` y, de forma recomendada, `ADMIN_PIN`.
3. Railway construye con Nixpacks y ejecuta `npm start` según `railway.json`. El despliegue se considera exitoso cuando `/api/health` responde.
4. Cada `git push` a `main` genera un nuevo despliegue automáticamente.

---

## Reutilización para otras rifas

Todos los datos propios de la rifa (títulos, premio, foto, fecha del sorteo y lotería) se definen en `public/rifa.config.js`; el valor del boleto se define con `PRECIO_BOLETO`. Para montar una rifa nueva con el mismo diseño no es necesario modificar el código. El procedimiento completo, junto con un prompt listo para usar con Claude Code, se encuentra en [`docs/NUEVA-RIFA.md`](docs/NUEVA-RIFA.md).

---

## Consideraciones operativas

- **Datos personales.** La aplicación almacena nombres y teléfonos de terceros. Se recomienda definir `ADMIN_PIN` y compartir la URL únicamente con los vendedores autorizados.
- **Respaldo.** Antes del sorteo conviene descargar la lista de compradores desde la sección *Compradores* como respaldo independiente de la base de datos.
- **Anulaciones.** Anular una venta elimina de forma definitiva el nombre y el teléfono asociados al número.
