# Cómo montar una nueva rifa con esta misma página

Esta aplicación está preparada para reutilizarse. El diseño, los colores, la cuadrícula de 100 números, el registro de compradores, el control de pagos, la consulta del ganador y la imagen para historias de Instagram son los mismos para cualquier rifa. Lo único que cambia son los datos de la rifa, y todos están en un solo archivo:

```
public/rifa.config.js
```

Más la foto del premio dentro de `public/img/`.

---

## Opción A: hacerlo con Claude Code (recomendado)

1. Descomprima `plantilla-rifa.zip` en una carpeta nueva, por ejemplo `Downloads/RIFA MADRES`.
2. Copie dentro de esa carpeta la foto del premio.
3. Abra esa carpeta en Claude Code y pegue el siguiente prompt, completando los datos entre corchetes.

```text
En esta carpeta hay una plantilla de una aplicación web de rifa (Node.js, Express,
PostgreSQL en Neon DB y despliegue en Railway). Necesito montar una NUEVA rifa con
exactamente el mismo diseño y funcionamiento. Lee docs/NUEVA-RIFA.md y README.md antes
de empezar.

REGLAS
- El frontend debe quedar idéntico. No modifiques public/styles.css, la estructura de
  public/index.html, ni la lógica de public/app.js, server.js o lib/.
- Los datos de la rifa se cambian únicamente en public/rifa.config.js.
- Copia la foto del premio a public/img/ con un nombre sin espacios ni tildes y
  apúntala en `fotoPremio`. Si la foto pesa más de 300 KB, redúcela a unos 600 px de
  ancho. Elimina public/img/reno-premio.jpg y public/img/afiche-rifa.jpg.
- En README.md reemplaza la tabla "Información de la rifa" con los datos nuevos y
  cualquier mención a la rifa anterior, manteniendo el tono formal.
- Inicia un repositorio git nuevo (sin historial de la rifa anterior) y haz el commit
  inicial.

DATOS DE LA NUEVA RIFA
- Primera línea del título (letras pequeñas): [Ej: Gran Rifa]
- Título grande: [Ej: Día de la Madre]
- Nombre completo de la rifa: [Ej: Gran Rifa Día de la Madre]
- Premio (descripción corta): [Ej: Ancheta gourmet con vino y chocolates]
- Archivo de la foto del premio: [Ej: ancheta.jpg, ya está en esta carpeta]
- Descripción de la foto (para accesibilidad): [Ej: Ancheta con vino y chocolates]
- Valor del boleto en pesos: [Ej: 10000]
- Fecha del sorteo: [Ej: 10 de mayo]
- Lotería: [Ej: Lotería de Medellín]
- Identificador corto sin espacios ni tildes: [Ej: rifa-madres]
- Repositorio de GitHub a crear: [Ej: camiloGS7/RIFA_MADRES]

DESPLIEGUE
1. Crea el repositorio en GitHub y sube el código a la rama main.
2. Guíame paso a paso para:
   a) Crear una base de datos nueva en Neon y obtener su DATABASE_URL. Si prefiero
      usar la misma base de datos de otra rifa, usa NOMBRE_TABLA=[Ej: boletos_madres]
      para que los datos no se mezclen.
   b) Crear un servicio nuevo en Railway conectado al repositorio.
   c) Definir las variables: DATABASE_URL, PRECIO_BOLETO, NOMBRE_TABLA (si aplica) y
      ADMIN_PIN (opcional; protege nombres y teléfonos).
   d) Generar el dominio público en Settings > Networking.
3. Cuando esté desplegado, verifica que /api/health responda con
   "baseDeDatos": true y entrégame la URL final.
```

---

## Opción B: hacerlo a mano

1. Descomprima `plantilla-rifa.zip` en una carpeta nueva.
2. Abra `public/rifa.config.js` y cambie los valores entre comillas. Cada campo tiene una explicación.
3. Copie la foto del premio en `public/img/` y escriba su ruta en `fotoPremio` (por ejemplo `'/img/ancheta.jpg'`).
4. Cree un repositorio nuevo en GitHub y suba la carpeta.
5. En Railway: **New Project → Deploy from GitHub repo**, seleccione el repositorio y en **Variables** defina:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Cadena de conexión de una base de datos nueva en Neon |
| `PRECIO_BOLETO` | Valor del boleto, por ejemplo `10000` |
| `NOMBRE_TABLA` | Solo si comparte base de datos con otra rifa, por ejemplo `boletos_madres` |
| `ADMIN_PIN` | Opcional. PIN que la aplicación pedirá a los vendedores |

6. En **Settings → Networking** pulse **Generate Domain**. La tabla y los 100 números se crean solos al primer arranque.

---

## Qué se puede y qué no se puede cambiar sin tocar código

| Se cambia en `rifa.config.js` o en Railway | Requiere modificar código |
|---|---|
| Títulos, premio, foto, fecha, lotería | Colores o tipografías |
| Valor del boleto (`PRECIO_BOLETO`) | Cantidad de números distinta de 100 (00 a 99) |
| Nombre de los archivos descargados | Campos adicionales en el formulario |

Los títulos largos se ajustan solos en la imagen para historias de Instagram.
