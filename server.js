'use strict';

require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');

const db = require('./lib/db');
const { validarNumero, validarComprador, validarPagado } = require('./lib/validacion');

const PORT = Number(process.env.PORT) || 3000;
const PRECIO_BOLETO = Number(process.env.PRECIO_BOLETO) || 10000;
const ADMIN_PIN = (process.env.ADMIN_PIN || '').trim();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

/* -------------------------------------------------------------------------- */
/* Middleware general                                                         */
/* -------------------------------------------------------------------------- */

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
});

app.use(express.json({ limit: '10kb' }));

app.use(
  express.static(path.join(__dirname, 'public'), {
    setHeaders(res, rutaArchivo) {
      if (/\.(jpg|jpeg|png|webp|svg)$/i.test(rutaArchivo)) {
        res.set('Cache-Control', 'public, max-age=604800');
      } else {
        res.set('Cache-Control', 'no-cache');
      }
    },
  })
);

/** Envuelve controladores asincronos para enviar los errores al manejador central. */
const manejar = (controlador) => (req, res, next) => {
  Promise.resolve(controlador(req, res, next)).catch(next);
};

/** Compara el PIN en tiempo constante para no filtrar informacion por tiempos de respuesta. */
function pinCorrecto(pinRecibido) {
  if (!ADMIN_PIN) return true;
  const a = crypto.createHash('sha256').update(String(pinRecibido || '')).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PIN).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Si se define ADMIN_PIN, todas las rutas de boletos exigen la cabecera
 * `X-Admin-Pin`. Asi los nombres y telefonos de los compradores no quedan
 * expuestos a cualquier persona que conozca la direccion.
 */
function requierePin(req, res, next) {
  if (pinCorrecto(req.get('X-Admin-Pin'))) return next();
  res.status(401).json({ ok: false, mensaje: 'PIN incorrecto o no enviado.' });
}

function numeroDesdeRuta(req, res) {
  const numero = validarNumero(req.params.numero);
  if (numero.error) {
    res.status(400).json({ ok: false, mensaje: numero.error });
    return null;
  }
  return numero.valor;
}

/* -------------------------------------------------------------------------- */
/* Rutas publicas                                                             */
/* -------------------------------------------------------------------------- */

app.get(
  '/api/health',
  manejar(async (req, res) => {
    const baseDeDatos = await db.verificarConexion();
    res.json({ ok: true, baseDeDatos, fecha: new Date().toISOString() });
  })
);

app.get('/api/config', (req, res) => {
  res.json({ ok: true, precio: PRECIO_BOLETO, requierePin: Boolean(ADMIN_PIN) });
});

app.post('/api/sesion', (req, res) => {
  const pin = req.body && req.body.pin;
  if (!pinCorrecto(pin)) {
    return res.status(401).json({ ok: false, mensaje: 'El PIN no es correcto.' });
  }
  res.json({ ok: true });
});

/* -------------------------------------------------------------------------- */
/* Rutas de boletos                                                           */
/* -------------------------------------------------------------------------- */

const boletos = express.Router();
boletos.use(requierePin);

/** GET /api/boletos — Los 100 boletos ordenados del 01 al 99 y finalmente el 00. */
boletos.get(
  '/',
  manejar(async (req, res) => {
    const lista = await db.listarBoletos();
    const vendidos = lista.filter((b) => b.vendido).length;
    const pagados = lista.filter((b) => b.pagado).length;
    res.json({
      ok: true,
      precio: PRECIO_BOLETO,
      resumen: {
        total: lista.length,
        vendidos,
        disponibles: lista.length - vendidos,
        pagados,
        pendientesDePago: vendidos - pagados,
        recaudado: pagados * PRECIO_BOLETO,
        porCobrar: (vendidos - pagados) * PRECIO_BOLETO,
      },
      boletos: lista,
    });
  })
);

/** GET /api/boletos/exportar — Lista de compradores en CSV (compatible con Excel). */
boletos.get(
  '/exportar',
  manejar(async (req, res) => {
    const lista = (await db.listarBoletos()).filter((b) => b.vendido);

    const celda = (valor) => {
      let texto = valor == null ? '' : String(valor);
      // Evita que Excel interprete el contenido como formula.
      if (/^[=+\-@]/.test(texto)) texto = "'" + texto;
      return '"' + texto.replace(/"/g, '""') + '"';
    };

    const filas = [['Numero', 'Nombre', 'Telefono', 'Pago', 'Fecha de venta']].concat(
      lista.map((b) => [
        b.numero,
        b.nombre,
        b.telefono,
        b.pagado ? 'Pagado' : 'Pendiente',
        b.fechaVenta
          ? new Date(b.fechaVenta).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
          : '',
      ])
    );

    const csv = '﻿' + filas.map((fila) => fila.map(celda).join(';')).join('\r\n');

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="compradores-rifa.csv"',
      'Cache-Control': 'no-store',
    });
    res.send(csv);
  })
);

/** POST /api/boletos/:numero/venta — Registra la venta con nombre y telefono. */
boletos.post(
  '/:numero/venta',
  manejar(async (req, res) => {
    const numero = numeroDesdeRuta(req, res);
    if (!numero) return;

    const comprador = validarComprador(req.body);
    if (comprador.errores) {
      return res.status(400).json({
        ok: false,
        mensaje: 'Revise los datos del comprador.',
        errores: comprador.errores,
      });
    }

    const { nombre, telefono, pagado } = comprador.valor;
    const boleto = await db.venderBoleto(numero, nombre, telefono, pagado);
    if (!boleto) {
      if (!(await db.existeBoleto(numero))) {
        return res.status(404).json({ ok: false, mensaje: `El boleto ${numero} no existe.` });
      }
      return res.status(409).json({
        ok: false,
        mensaje: `El numero ${numero} ya fue vendido por otra persona. Elija otro numero.`,
      });
    }

    res.status(201).json({ ok: true, boleto });
  })
);

/** PUT /api/boletos/:numero/venta — Corrige el nombre o telefono de un boleto vendido. */
boletos.put(
  '/:numero/venta',
  manejar(async (req, res) => {
    const numero = numeroDesdeRuta(req, res);
    if (!numero) return;

    const comprador = validarComprador(req.body);
    if (comprador.errores) {
      return res.status(400).json({
        ok: false,
        mensaje: 'Revise los datos del comprador.',
        errores: comprador.errores,
      });
    }

    const { nombre, telefono, pagado } = comprador.valor;
    const boleto = await db.actualizarComprador(numero, nombre, telefono, pagado);
    if (!boleto) {
      return res.status(404).json({ ok: false, mensaje: `El numero ${numero} no esta vendido.` });
    }

    res.json({ ok: true, boleto });
  })
);

/** PATCH /api/boletos/:numero/pago — Marca un boleto vendido como pagado o pendiente. */
boletos.patch(
  '/:numero/pago',
  manejar(async (req, res) => {
    const numero = numeroDesdeRuta(req, res);
    if (!numero) return;

    const pagado = validarPagado(req.body && req.body.pagado);
    if (pagado.error) {
      return res.status(400).json({ ok: false, mensaje: pagado.error });
    }

    const boleto = await db.marcarPago(numero, pagado.valor);
    if (!boleto) {
      return res.status(404).json({ ok: false, mensaje: `El numero ${numero} no esta vendido.` });
    }

    res.json({ ok: true, boleto });
  })
);

/** DELETE /api/boletos/:numero/venta — Anula la venta y libera el numero. */
boletos.delete(
  '/:numero/venta',
  manejar(async (req, res) => {
    const numero = numeroDesdeRuta(req, res);
    if (!numero) return;

    const boleto = await db.anularVenta(numero);
    if (!boleto) {
      return res.status(404).json({ ok: false, mensaje: `El numero ${numero} no esta vendido.` });
    }

    res.json({ ok: true, boleto });
  })
);

app.use('/api/boletos', boletos);

/* -------------------------------------------------------------------------- */
/* Errores y frontend                                                         */
/* -------------------------------------------------------------------------- */

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, mensaje: 'Ruta no encontrada.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, mensaje: 'La solicitud no tiene un formato valido.' });
  }
  const status = error.status || 500;
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, error.message);
  res.status(status).json({
    ok: false,
    mensaje:
      status === 503
        ? error.message
        : 'Ocurrio un problema en el servidor. Intente de nuevo en unos segundos.',
  });
});

/* -------------------------------------------------------------------------- */
/* Arranque                                                                   */
/* -------------------------------------------------------------------------- */

async function iniciar() {
  if (!process.env.DATABASE_URL) {
    console.warn('[WARN] DATABASE_URL no esta definida. La API respondera con error 503.');
  } else {
    try {
      await db.inicializar();
      console.log('[INFO] Base de datos verificada (100 boletos disponibles en la tabla).');
    } catch (error) {
      console.error('[ERROR] No fue posible inicializar la base de datos:', error.message);
    }
  }

  if (!ADMIN_PIN) {
    console.warn('[WARN] ADMIN_PIN no esta definido: cualquier persona con la URL puede ver y modificar las ventas.');
  }

  const servidor = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[INFO] Servidor escuchando en el puerto ${PORT}`);
  });

  const apagar = (senal) => {
    console.log(`[INFO] Senal ${senal} recibida. Cerrando servidor...`);
    servidor.close(() => {
      db.cerrar().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
}

iniciar();
