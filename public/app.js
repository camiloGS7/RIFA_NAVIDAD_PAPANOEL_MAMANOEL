'use strict';

/* ==========================================================================
   Lógica del cliente. Los textos propios de la rifa están en rifa.config.js.
   ========================================================================== */

const RIFA = Object.assign(
  {
    antetitulo: 'Gran Rifa',
    titulo: '',
    nombreCompleto: 'Rifa',
    premio: '',
    fotoPremio: '',
    fotoPremioDescripcion: 'Foto del premio',
    fechaSorteo: '',
    loteria: '',
    identificador: 'rifa',
  },
  window.RIFA || {}
);

const CLAVE_PIN = `${RIFA.identificador}-pin`;
const INTERVALO_ACTUALIZACION = 20000;

const estado = {
  precio: 10000,
  boletos: [],
  vistaActual: 'talonario',
  seleccionado: null, // número abierto en la ventana
  modoFormulario: 'vender', // 'vender' | 'corregir'
  guardando: false,
  temporizador: null,
};

/* ------------------------------ Utilidades ------------------------------ */

const $ = (selector) => document.querySelector(selector);

function leerPin() {
  try {
    return localStorage.getItem(CLAVE_PIN) || '';
  } catch (e) {
    return '';
  }
}

function guardarPin(pin) {
  try {
    localStorage.setItem(CLAVE_PIN, pin);
  } catch (e) {
    /* almacenamiento no disponible */
  }
}

function formatearPesos(valor) {
  return '$' + Number(valor || 0).toLocaleString('es-CO');
}

function formatearTelefono(digitos) {
  const t = String(digitos || '');
  if (t.length === 10) return `${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}`;
  if (t.length === 12 && t.startsWith('57')) {
    return `+57 ${t.slice(2, 5)} ${t.slice(5, 8)} ${t.slice(8)}`;
  }
  return t || '—';
}

function formatearFecha(iso) {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleString('es-CO', {
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Número en formato internacional. En Colombia celulares y fijos tienen
 * 10 dígitos, así que a esos se les antepone el indicativo 57.
 */
function telefonoWhatsApp(digitos) {
  const t = String(digitos || '');
  if (t.length === 10) return '57' + t;
  return t;
}

function enlaceLlamar(digitos) {
  const t = telefonoWhatsApp(digitos);
  return t.length >= 11 ? `tel:+${t}` : `tel:${t}`;
}

function enlaceWhatsApp(boleto, esGanador) {
  const base = `https://wa.me/${telefonoWhatsApp(boleto.telefono)}`;
  const texto = esGanador
    ? `Hola ${boleto.nombre}, le escribimos de la ${RIFA.nombreCompleto}. ¡Felicitaciones! Su número ${boleto.numero} resultó ganador del sorteo. Comuníquese con nosotros para entregarle el premio.`
    : `Hola ${boleto.nombre}, le escribimos de la ${RIFA.nombreCompleto} sobre su número ${boleto.numero}.`;
  return `${base}?text=${encodeURIComponent(texto)}`;
}

function crear(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto != null) nodo.textContent = texto;
  return nodo;
}

function icono(nombre) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icono');
  svg.setAttribute('aria-hidden', 'true');
  const uso = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  uso.setAttribute('href', '#i-' + nombre);
  svg.appendChild(uso);
  return svg;
}

function buscarBoleto(numero) {
  return estado.boletos.find((b) => b.numero === numero) || null;
}

/* ------------------------------ API ------------------------------ */

class ErrorApi extends Error {
  constructor(mensaje, status, errores) {
    super(mensaje);
    this.status = status;
    this.errores = errores || null;
  }
}

async function api(ruta, opciones = {}) {
  const cabeceras = { 'X-Admin-Pin': leerPin() };
  if (opciones.cuerpo) cabeceras['Content-Type'] = 'application/json';

  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method: opciones.metodo || 'GET',
      headers: cabeceras,
      body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
      cache: 'no-store',
    });
  } catch (e) {
    throw new ErrorApi('No hay conexión a internet o el servidor no responde.', 0);
  }

  let datos = {};
  try {
    datos = await respuesta.json();
  } catch (e) {
    /* respuesta sin JSON */
  }

  if (respuesta.status === 401) {
    mostrarPantallaPin();
    throw new ErrorApi(datos.mensaje || 'Se necesita el PIN.', 401);
  }

  if (!respuesta.ok || datos.ok === false) {
    throw new ErrorApi(
      datos.mensaje || 'Ocurrió un problema. Intente de nuevo.',
      respuesta.status,
      datos.errores
    );
  }
  return datos;
}

/* ------------------------------ Carga de datos ------------------------------ */

async function cargarBoletos({ silencioso = false } = {}) {
  try {
    const datos = await api('/api/boletos');
    estado.boletos = datos.boletos;
    if (datos.precio) estado.precio = datos.precio;
    $('#aviso-error').hidden = true;
    renderizar();
  } catch (error) {
    if (error.status === 401) return;
    if (!silencioso || estado.boletos.length === 0) {
      $('#aviso-error-texto').textContent =
        error.status === 503
          ? 'La base de datos no está disponible en este momento.'
          : error.message;
      $('#aviso-error').hidden = false;
    }
  } finally {
    $('#grilla-cargando').hidden = estado.boletos.length > 0 || !$('#aviso-error').hidden;
    $('#grilla').hidden = estado.boletos.length === 0;
  }
}

function programarActualizacion() {
  clearInterval(estado.temporizador);
  estado.temporizador = setInterval(() => {
    const ventanaAbierta = $('#dialogo').open;
    if (document.visibilityState === 'visible' && !ventanaAbierta && !estado.guardando) {
      cargarBoletos({ silencioso: true });
    }
  }, INTERVALO_ACTUALIZACION);
}

/* ------------------------------ Renderizado ------------------------------ */

function renderizar() {
  renderizarResumen();
  renderizarGrilla();
  renderizarCompradores();
  if ($('#resultado-ganador').dataset.numero) {
    mostrarGanador($('#resultado-ganador').dataset.numero);
  }
}

function renderizarResumen() {
  const vendidos = estado.boletos.filter((b) => b.vendido).length;
  const pagados = estado.boletos.filter((b) => b.pagado).length;
  const deben = vendidos - pagados;
  const total = estado.boletos.length || 100;
  $('#res-vendidos').textContent = vendidos;
  $('#res-disponibles').textContent = total - vendidos;
  $('#res-recaudado').textContent = formatearPesos(pagados * estado.precio);
  $('#res-por-cobrar').textContent = formatearPesos(deben * estado.precio);
  $('#res-pendientes').textContent = deben > 0 ? `(${deben} ${deben === 1 ? 'persona' : 'personas'})` : '';
  $('#res-barra').style.width = `${(vendidos / total) * 100}%`;
  document.querySelectorAll('[data-precio]').forEach((n) => {
    n.textContent = formatearPesos(estado.precio);
  });
}

function renderizarGrilla() {
  const grilla = $('#grilla');
  const fragmento = document.createDocumentFragment();

  estado.boletos.forEach((boleto) => {
    let clase = 'numero';
    if (boleto.vendido) clase += boleto.pagado ? ' numero--vendido' : ' numero--debe';
    const boton = crear('button', clase);
    boton.type = 'button';
    boton.dataset.numero = boleto.numero;
    boton.setAttribute(
      'aria-label',
      boleto.vendido
        ? `Número ${boleto.numero}, vendido a ${boleto.nombre}, ${boleto.pagado ? 'pagado' : 'falta pagar'}`
        : `Número ${boleto.numero}, libre`
    );
    boton.appendChild(crear('span', null, boleto.numero));

    if (boleto.vendido) {
      const marca = crear('span', 'numero__marca');
      marca.appendChild(icono(boleto.pagado ? 'check' : 'clock'));
      boton.appendChild(marca);
    }
    fragmento.appendChild(boton);
  });

  grilla.replaceChildren(fragmento);
}

function renderizarCompradores() {
  const vendidos = estado.boletos.filter((b) => b.vendido);
  const termino = $('#buscar').value.trim().toLowerCase();
  const terminoDigitos = termino.replace(/\D/g, '');

  const filtroPago = (document.querySelector('input[name="filtro-pago"]:checked') || {}).value || 'todos';

  const filtrados = vendidos.filter((b) => {
    if (filtroPago === 'pagados' && !b.pagado) return false;
    if (filtroPago === 'deben' && b.pagado) return false;
    if (!termino) return true;
    return (
      (b.nombre || '').toLowerCase().includes(termino) ||
      b.numero.includes(termino) ||
      (terminoDigitos.length >= 3 && (b.telefono || '').includes(terminoDigitos))
    );
  });

  const deben = vendidos.filter((b) => !b.pagado).length;
  $('#compradores-conteo').textContent =
    vendidos.length === 0
      ? 'Aún no hay ventas.'
      : `${vendidos.length} ${vendidos.length === 1 ? 'número vendido' : 'números vendidos'}` +
        (deben > 0 ? `, ${deben} sin pagar.` : '. Todos pagaron.');

  const lista = $('#lista-compradores');
  const fragmento = document.createDocumentFragment();

  filtrados.forEach((boleto) => {
    const item = crear('li');
    const boton = crear('button', 'comprador');
    boton.type = 'button';
    boton.dataset.numero = boleto.numero;

    boton.appendChild(crear('span', boleto.pagado ? 'ficha' : 'ficha ficha--debe', boleto.numero));
    const info = crear('span', 'comprador__info');
    info.appendChild(crear('span', 'comprador__nombre', boleto.nombre));
    info.appendChild(crear('span', 'comprador__telefono', formatearTelefono(boleto.telefono)));
    info.appendChild(etiquetaPago(boleto.pagado));
    boton.appendChild(info);

    item.appendChild(boton);
    fragmento.appendChild(item);
  });

  lista.replaceChildren(fragmento);

  const vacio = $('#lista-vacia');
  if (filtrados.length === 0) {
    if (termino) {
      vacio.textContent = 'No se encontró ningún comprador con esa búsqueda.';
    } else if (vendidos.length > 0 && filtroPago === 'deben') {
      vacio.textContent = 'Nadie debe. Todos los compradores ya pagaron.';
    } else if (vendidos.length > 0 && filtroPago === 'pagados') {
      vacio.textContent = 'Todavía nadie ha pagado.';
    } else {
      vacio.textContent = 'Cuando venda un número, el comprador aparecerá aquí.';
    }
    vacio.hidden = false;
  } else {
    vacio.hidden = true;
  }
}

/* ------------------------------ Pestañas ------------------------------ */

function cambiarVista(vista, { enfocar = false } = {}) {
  estado.vistaActual = vista;
  document.querySelectorAll('.pestana').forEach((pestana) => {
    const activa = pestana.dataset.vista === vista;
    pestana.setAttribute('aria-selected', String(activa));
    pestana.tabIndex = activa ? 0 : -1;
    if (activa && enfocar) pestana.focus();
  });
  document.querySelectorAll('.vista').forEach((panel) => {
    panel.hidden = panel.id !== `vista-${vista}`;
  });
}

/* ------------------------------ Ventana del número ------------------------------ */

/** Etiqueta visible "Pagado" / "Falta pagar" con icono (no depende solo del color). */
function etiquetaPago(pagado) {
  const etiqueta = crear('span', `etiqueta-pago etiqueta-pago--${pagado ? 'si' : 'no'}`);
  etiqueta.append(icono(pagado ? 'check' : 'clock'), crear('span', null, pagado ? 'Pagado' : 'Falta pagar'));
  return etiqueta;
}

function pagoElegido() {
  const opcion = document.querySelector('input[name="pagado"]:checked');
  return opcion ? opcion.value === 'si' : null;
}

function limpiarErrores() {
  ['nombre', 'telefono', 'pagado'].forEach((campo) => {
    $(`#campo-${campo}`).removeAttribute('aria-invalid');
    $(`#error-${campo}`).hidden = true;
  });
  $('#error-general').hidden = true;
}

function mostrarErrorCampo(campo, mensaje) {
  $(`#campo-${campo}`).setAttribute('aria-invalid', 'true');
  const nodo = $(`#error-${campo}`);
  nodo.textContent = mensaje;
  nodo.hidden = false;
}

function abrirNumero(numero) {
  const boleto = buscarBoleto(numero);
  if (!boleto) return;
  estado.seleccionado = numero;

  $('#dialogo-ficha').textContent = numero;
  $('#dialogo-titulo').textContent = `Número ${numero}`;
  $('#confirmar-anular').hidden = true;
  limpiarErrores();

  if (boleto.vendido) {
    mostrarDetalle(boleto);
  } else {
    mostrarFormulario('vender', boleto);
  }

  const dialogo = $('#dialogo');
  if (!dialogo.open) dialogo.showModal();

  if (!boleto.vendido) {
    setTimeout(() => $('#campo-nombre').focus(), 60);
  }
}

function marcarEstado(boleto) {
  const vendido = boleto.vendido;
  const etiqueta = $('#dialogo-estado');
  etiqueta.textContent = vendido ? 'Vendido' : 'Libre';
  etiqueta.classList.toggle('dialogo__estado--vendido', vendido);
  $('#dialogo-ficha').classList.toggle('ficha--libre', !vendido);
  $('#dialogo-ficha').classList.toggle('ficha--debe', vendido && !boleto.pagado);
}

function mostrarFormulario(modo, boleto) {
  estado.modoFormulario = modo;
  marcarEstado(boleto);

  $('#detalle').hidden = true;
  $('#form-comprador').hidden = false;
  document.querySelectorAll('input[name="pagado"]').forEach((opcion) => {
    opcion.checked = false;
  });

  if (modo === 'vender') {
    $('#form-ayuda').textContent = `Anote los datos de quien compra el número ${boleto.numero}.`;
    $('#boton-guardar-texto').textContent = 'Guardar venta';
    $('#campo-nombre').value = '';
    $('#campo-telefono').value = '';
  } else {
    $('#form-ayuda').textContent = 'Corrija los datos y guarde los cambios.';
    $('#boton-guardar-texto').textContent = 'Guardar cambios';
    $('#campo-nombre').value = boleto.nombre || '';
    $('#campo-telefono').value = formatearTelefono(boleto.telefono);
    document.querySelector(`input[name="pagado"][value="${boleto.pagado ? 'si' : 'no'}"]`).checked = true;
  }
}

function mostrarDetalle(boleto) {
  marcarEstado(boleto);
  $('#form-comprador').hidden = true;
  $('#detalle').hidden = false;
  $('#confirmar-anular').hidden = true;

  $('#detalle-nombre').textContent = boleto.nombre || '—';
  $('#detalle-telefono').textContent = formatearTelefono(boleto.telefono);

  const pago = $('#detalle-pago');
  pago.className = `etiqueta-pago etiqueta-pago--${boleto.pagado ? 'si' : 'no'}`;
  pago.replaceChildren(
    icono(boleto.pagado ? 'check' : 'clock'),
    crear('span', null, boleto.pagado ? 'Ya pagó' : `Falta pagar ${formatearPesos(estado.precio)}`)
  );
  const botonPago = $('#boton-cambiar-pago');
  botonPago.classList.toggle('boton--verde', !boleto.pagado);
  botonPago.classList.toggle('boton--secundario', boleto.pagado);
  $('#boton-cambiar-pago-texto').textContent = boleto.pagado
    ? 'Marcar que todavía no ha pagado'
    : 'Ya pagó: marcar como pagado';
  $('#detalle-fecha').textContent = formatearFecha(boleto.fechaVenta);
  $('#detalle-llamar').href = enlaceLlamar(boleto.telefono);
  $('#detalle-whatsapp').href = enlaceWhatsApp(boleto, false);
}

function cerrarDialogo() {
  if (estado.guardando) return;
  $('#dialogo').close();
}

function actualizarBoletoLocal(boleto) {
  const indice = estado.boletos.findIndex((b) => b.numero === boleto.numero);
  if (indice !== -1) estado.boletos[indice] = boleto;
  renderizar();
}

function resaltarNumero(numero) {
  const celda = document.querySelector(`.numero[data-numero="${numero}"]`);
  if (!celda) return;
  celda.classList.remove('numero--resaltado');
  void celda.offsetWidth; // reinicia la animación
  celda.classList.add('numero--resaltado');
}

async function enviarFormulario(evento) {
  evento.preventDefault();
  if (estado.guardando || !estado.seleccionado) return;
  limpiarErrores();

  const nombre = $('#campo-nombre').value.replace(/\s+/g, ' ').trim();
  const telefono = $('#campo-telefono').value.trim();
  const digitos = telefono.replace(/\D/g, '');

  let valido = true;
  if (nombre.length < 3) {
    mostrarErrorCampo('nombre', 'Escriba el nombre completo del comprador.');
    valido = false;
  }
  if (digitos.length === 0) {
    mostrarErrorCampo('telefono', 'Escriba un teléfono para poder avisarle si gana.');
    valido = false;
  } else if (digitos.length < 7 || digitos.length > 15) {
    mostrarErrorCampo('telefono', 'El teléfono parece incompleto. Ejemplo: 300 123 4567.');
    valido = false;
  }
  const pagado = pagoElegido();
  if (pagado === null) {
    mostrarErrorCampo('pagado', 'Elija si ya pagó o si queda debiendo.');
    valido = false;
  }
  if (!valido) {
    const primerError = document.querySelector('#form-comprador [aria-invalid="true"]');
    if (primerError) {
      (primerError.matches('input') ? primerError : primerError.querySelector('input')).focus();
    }
    return;
  }

  const numero = estado.seleccionado;
  const esVenta = estado.modoFormulario === 'vender';
  const boton = $('#boton-guardar');
  const textoOriginal = $('#boton-guardar-texto').textContent;

  estado.guardando = true;
  boton.disabled = true;
  $('#boton-guardar-texto').textContent = 'Guardando…';

  try {
    const datos = await api(`/api/boletos/${numero}/venta`, {
      metodo: esVenta ? 'POST' : 'PUT',
      cuerpo: { nombre, telefono, pagado },
    });
    estado.guardando = false;
    actualizarBoletoLocal(datos.boleto);
    $('#dialogo').close();
    resaltarNumero(numero);
    notificar(
      esVenta
        ? `Número ${numero} vendido a ${datos.boleto.nombre}` +
            (datos.boleto.pagado ? ' (pagado).' : ' (queda debiendo).')
        : `Datos del número ${numero} actualizados.`
    );
  } catch (error) {
    estado.guardando = false;
    if (error.errores) {
      Object.keys(error.errores).forEach((campo) => mostrarErrorCampo(campo, error.errores[campo]));
    } else {
      $('#error-general').textContent = error.message;
      $('#error-general').hidden = false;
    }
    if (error.status === 409) {
      // Otro vendedor lo tomó primero: refrescar para mostrar el estado real.
      await cargarBoletos({ silencioso: true });
    }
  } finally {
    boton.disabled = false;
    $('#boton-guardar-texto').textContent = textoOriginal;
  }
}

async function cambiarPago() {
  const boleto = buscarBoleto(estado.seleccionado);
  if (!boleto || !boleto.vendido || estado.guardando) return;
  const boton = $('#boton-cambiar-pago');
  const nuevoEstado = !boleto.pagado;
  estado.guardando = true;
  boton.disabled = true;

  try {
    const datos = await api(`/api/boletos/${boleto.numero}/pago`, {
      metodo: 'PATCH',
      cuerpo: { pagado: nuevoEstado },
    });
    estado.guardando = false;
    actualizarBoletoLocal(datos.boleto);
    mostrarDetalle(datos.boleto);
    notificar(
      nuevoEstado
        ? `${datos.boleto.nombre} ya pagó el número ${boleto.numero}.`
        : `El número ${boleto.numero} quedó marcado como pendiente de pago.`
    );
  } catch (error) {
    estado.guardando = false;
    notificar(error.message, true);
    await cargarBoletos({ silencioso: true });
  } finally {
    boton.disabled = false;
  }
}

async function anularVenta() {
  const numero = estado.seleccionado;
  if (!numero || estado.guardando) return;
  const boton = document.querySelector('[data-accion="anular"]');
  estado.guardando = true;
  boton.disabled = true;

  try {
    const datos = await api(`/api/boletos/${numero}/venta`, { metodo: 'DELETE' });
    estado.guardando = false;
    actualizarBoletoLocal(datos.boleto);
    $('#dialogo').close();
    notificar(`La venta del número ${numero} fue anulada. El número quedó libre.`);
  } catch (error) {
    estado.guardando = false;
    notificar(error.message, true);
    await cargarBoletos({ silencioso: true });
  } finally {
    boton.disabled = false;
  }
}

/* ------------------------------ Ganador ------------------------------ */

function mostrarGanador(numero) {
  const contenedor = $('#resultado-ganador');
  contenedor.dataset.numero = numero;
  const boleto = buscarBoleto(numero);
  const tarjeta = crear('div', 'tarjeta-ganador');
  const cabecera = crear('div', 'tarjeta-ganador__cabecera');

  if (boleto && boleto.vendido) {
    cabecera.appendChild(crear('span', 'ficha', numero));
    const titulos = crear('div');
    titulos.appendChild(crear('p', 'texto-suave', 'El número ganador lo compró:'));
    titulos.appendChild(crear('h3', null, boleto.nombre));
    cabecera.appendChild(titulos);
    tarjeta.appendChild(cabecera);

    const datos = crear('dl', 'datos');
    [
      ['Teléfono', formatearTelefono(boleto.telefono)],
      ['Fecha de compra', formatearFecha(boleto.fechaVenta)],
    ].forEach(([titulo, valor]) => {
      const fila = crear('div');
      fila.appendChild(crear('dt', null, titulo));
      fila.appendChild(crear('dd', null, valor));
      datos.appendChild(fila);
    });
    const filaPago = crear('div');
    filaPago.appendChild(crear('dt', null, 'Pago del boleto'));
    const ddPago = crear('dd');
    ddPago.appendChild(etiquetaPago(boleto.pagado));
    filaPago.appendChild(ddPago);
    datos.appendChild(filaPago);
    tarjeta.appendChild(datos);

    const acciones = crear('div', 'acciones');
    const llamar = crear('a', 'boton boton--primario');
    llamar.href = enlaceLlamar(boleto.telefono);
    llamar.append(icono('phone'), crear('span', null, 'Llamar al ganador'));
    const whatsapp = crear('a', 'boton boton--whatsapp');
    whatsapp.href = enlaceWhatsApp(boleto, true);
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener';
    whatsapp.append(icono('chat'), crear('span', null, 'Avisar por WhatsApp'));
    acciones.append(llamar, whatsapp);
    tarjeta.appendChild(acciones);
  } else {
    tarjeta.classList.add('tarjeta-ganador--sin-venta');
    const ficha = crear('span', 'ficha ficha--libre', numero);
    cabecera.appendChild(ficha);
    const titulos = crear('div');
    titulos.appendChild(crear('h3', null, 'Este número no se vendió'));
    titulos.appendChild(
      crear('p', 'texto-suave', 'Nadie compró el número ' + numero + ', así que no hay ganador con él.')
    );
    cabecera.appendChild(titulos);
    tarjeta.appendChild(cabecera);
  }

  contenedor.replaceChildren(tarjeta);
}

function enviarGanador(evento) {
  evento.preventDefault();
  const campo = $('#numero-ganador');
  const error = $('#error-ganador');
  const valor = campo.value.replace(/\D/g, '');

  if (valor.length !== 2) {
    campo.setAttribute('aria-invalid', 'true');
    error.textContent = 'Escriba exactamente 2 cifras, por ejemplo 07 o 45.';
    error.hidden = false;
    campo.focus();
    return;
  }
  campo.removeAttribute('aria-invalid');
  error.hidden = true;
  mostrarGanador(valor);
}

/* ------------------------------ Descarga ------------------------------ */

async function descargarLista(evento) {
  evento.preventDefault();
  try {
    const respuesta = await fetch('/api/boletos/exportar', {
      headers: { 'X-Admin-Pin': leerPin() },
      cache: 'no-store',
    });
    if (respuesta.status === 401) {
      mostrarPantallaPin();
      return;
    }
    if (!respuesta.ok) throw new Error();
    const archivo = await respuesta.blob();
    const url = URL.createObjectURL(archivo);
    const enlace = crear('a');
    enlace.href = url;
    enlace.download = `compradores-${RIFA.identificador}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    notificar('No se pudo descargar la lista. Intente de nuevo.', true);
  }
}

/* ------------------------------ Imagen para historia ------------------------------ */

/**
 * Formato de historia de Instagram: 1080 x 1920 px (9:16).
 * Se dejan libres ~250 px arriba y abajo, donde Instagram superpone
 * el nombre de la cuenta y la barra de respuesta.
 */
const HISTORIA = { ancho: 1080, alto: 1920, zonaSegura: 250 };

function cargarImagen(src) {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image();
    imagen.onload = () => resolver(imagen);
    imagen.onerror = rechazar;
    imagen.src = src;
  });
}

function trazarRectangulo(ctx, x, y, ancho, alto, radio) {
  ctx.beginPath();
  ctx.moveTo(x + radio, y);
  ctx.arcTo(x + ancho, y, x + ancho, y + alto, radio);
  ctx.arcTo(x + ancho, y + alto, x, y + alto, radio);
  ctx.arcTo(x, y + alto, x, y, radio);
  ctx.arcTo(x, y, x + ancho, y, radio);
  ctx.closePath();
}

function dibujarCasilla(ctx, x, y, lado, numero, vendido) {
  trazarRectangulo(ctx, x, y, lado, lado, 14);
  ctx.fillStyle = vendido ? '#5E0E14' : '#FFFFFF';
  ctx.fill();
  if (vendido) {
    ctx.strokeStyle = 'rgba(201, 149, 43, 0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.fillStyle = vendido ? 'rgba(255, 255, 255, 0.38)' : '#24160F';
  ctx.font = '700 40px "Atkinson Hyperlegible", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(numero, x + lado / 2, y + lado / 2 + 2);

  if (vendido) {
    // Tachado dorado, como un número tachado en el talonario.
    ctx.strokeStyle = '#E2B04A';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 16, y + lado - 16);
    ctx.lineTo(x + lado - 16, y + 16);
    ctx.stroke();
  }
}

async function generarImagenHistoria() {
  const { ancho, alto } = HISTORIA;

  await Promise.all([
    document.fonts.load('800 150px "Fraunces"'),
    document.fonts.load('700 40px "Atkinson Hyperlegible"'),
    document.fonts.load('400 40px "Atkinson Hyperlegible"'),
  ]).catch(() => {});
  const foto = RIFA.fotoPremio ? await cargarImagen(RIFA.fotoPremio).catch(() => null) : null;

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');

  // Fondo
  const fondo = ctx.createLinearGradient(0, 0, 0, alto);
  fondo.addColorStop(0, '#B3242E');
  fondo.addColorStop(0.55, '#A3202A');
  fondo.addColorStop(1, '#6E1118');
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, ancho, alto);

  const brillo = ctx.createRadialGradient(170, 140, 0, 170, 140, 760);
  brillo.addColorStop(0, 'rgba(201, 149, 43, 0.38)');
  brillo.addColorStop(1, 'rgba(201, 149, 43, 0)');
  ctx.fillStyle = brillo;
  ctx.fillRect(0, 0, ancho, alto);

  // Destellos (semilla fija para que la imagen sea siempre igual)
  let semilla = 11;
  const azar = () => {
    semilla = (semilla * 9301 + 49297) % 233280;
    return semilla / 233280;
  };
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(255, 236, 185, ${0.12 + azar() * 0.45})`;
    ctx.beginPath();
    ctx.arc(azar() * ancho, azar() * alto, 1.5 + azar() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Guirnalda de luces (zona superior, solo decorativa)
  ctx.save();
  ctx.shadowColor = 'rgba(255, 220, 130, 0.95)';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#FFE7A3';
  for (let x = 30; x < ancho; x += 64) {
    ctx.beginPath();
    ctx.arc(x, 70 + Math.sin(x / 95) * 22, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Títulos
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#F6E7C1';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '14px';
  ajustarFuente(ctx, RIFA.antetitulo.toUpperCase(), 700, 46, '"Atkinson Hyperlegible", system-ui, sans-serif', 960);
  ctx.fillText(RIFA.antetitulo.toUpperCase(), ancho / 2 + 7, 288);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  ctx.save();
  ctx.shadowColor = 'rgba(255, 214, 120, 0.55)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#FFFFFF';
  ajustarFuente(ctx, RIFA.titulo, 800, 150, '"Fraunces", Georgia, serif', 960);
  ctx.fillText(RIFA.titulo, ancho / 2, 418);
  ctx.restore();

  // Cuadrícula 10 x 10
  const lado = 86;
  const hueco = 6;
  const anchoGrilla = lado * 10 + hueco * 9;
  const x0 = (ancho - anchoGrilla) / 2;
  const y0 = 458;

  trazarRectangulo(ctx, x0 - 16, y0 - 16, anchoGrilla + 32, anchoGrilla + 32, 30);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(246, 231, 193, 0.65)';
  ctx.lineWidth = 3;
  ctx.stroke();

  estado.boletos.forEach((boleto, i) => {
    const x = x0 + (i % 10) * (lado + hueco);
    const y = y0 + Math.floor(i / 10) * (lado + hueco);
    dibujarCasilla(ctx, x, y, lado, boleto.numero, boleto.vendido);
  });

  // Leyenda y números disponibles
  const yLeyenda = y0 + anchoGrilla + 40;
  const disponibles = estado.boletos.filter((b) => !b.vendido).length;

  dibujarCasilla(ctx, x0, yLeyenda, 40, '', false);
  dibujarCasilla(ctx, x0 + 170, yLeyenda, 40, '', true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 32px "Atkinson Hyperlegible", system-ui, sans-serif';
  ctx.fillText('Libre', x0 + 54, yLeyenda + 21);
  ctx.fillText('Vendido', x0 + 224, yLeyenda + 21);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFD978';
  ctx.font = '700 36px "Atkinson Hyperlegible", system-ui, sans-serif';
  ctx.fillText(
    disponibles === 0
      ? '¡Todos vendidos!'
      : `¡Quedan ${disponibles} ${disponibles === 1 ? 'número' : 'números'}!`,
    x0 + anchoGrilla,
    yLeyenda + 21
  );

  // Premio, precio y sorteo (termina antes de la zona inferior reservada)
  const yInfo = yLeyenda + 76;
  const ladoFoto = 176;
  trazarRectangulo(ctx, x0, yInfo, ladoFoto, ladoFoto, 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  if (foto) {
    ctx.save();
    trazarRectangulo(ctx, x0 + 6, yInfo + 6, ladoFoto - 12, ladoFoto - 12, 15);
    ctx.clip();
    const escala = Math.max((ladoFoto - 12) / foto.width, (ladoFoto - 12) / foto.height);
    const w = foto.width * escala;
    const h = foto.height * escala;
    ctx.drawImage(foto, x0 + 6 + (ladoFoto - 12 - w) / 2, yInfo + 6 + (ladoFoto - 12 - h) / 2, w, h);
    ctx.restore();
  }

  const xTexto = x0 + ladoFoto + 36;
  const anchoTexto = x0 + anchoGrilla - xTexto;
  const sansSerif = '"Atkinson Hyperlegible", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const textoPremio = `Premio: ${RIFA.premio}`;
  ctx.fillStyle = '#F6E7C1';
  ajustarFuente(ctx, textoPremio, 400, 30, sansSerif, anchoTexto);
  ctx.fillText(textoPremio, xTexto, yInfo + 30);

  ctx.fillStyle = '#FFD978';
  ctx.font = '800 64px "Fraunces", Georgia, serif';
  const precio = formatearPesos(estado.precio);
  ctx.fillText(precio, xTexto, yInfo + 100);
  const anchoPrecio = ctx.measureText(precio).width;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 34px "Atkinson Hyperlegible", system-ui, sans-serif';
  ctx.fillText('por boleto', xTexto + anchoPrecio + 16, yInfo + 98);

  const textoFecha = `Sorteo: ${RIFA.fechaSorteo}`;
  ajustarFuente(ctx, textoFecha, 700, 34, sansSerif, anchoTexto);
  ctx.fillText(textoFecha, xTexto, yInfo + 144);

  const textoLoteria = `Últimas 2 cifras de la ${RIFA.loteria}`;
  ctx.fillStyle = '#F6E7C1';
  ajustarFuente(ctx, textoLoteria, 400, 28, sansSerif, anchoTexto);
  ctx.fillText(textoLoteria, xTexto, yInfo + 180);

  return new Promise((resolver) => lienzo.toBlob(resolver, 'image/png'));
}

/** Reduce el tamaño de letra hasta que el texto quepa en el ancho indicado. */
function ajustarFuente(ctx, texto, peso, tamano, familia, anchoMaximo) {
  let actual = tamano;
  ctx.font = `${peso} ${actual}px ${familia}`;
  while (actual > 14 && ctx.measureText(texto).width > anchoMaximo) {
    actual -= 2;
    ctx.font = `${peso} ${actual}px ${familia}`;
  }
}

function guardarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = crear('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function descargarHistoria() {
  const boton = $('#boton-historia');
  const texto = $('#boton-historia-texto');
  if (boton.disabled) return;
  if (estado.boletos.length === 0) {
    notificar('Espere a que carguen los números e intente de nuevo.', true);
    return;
  }

  const nombre = `${RIFA.identificador}-historia.png`;
  boton.disabled = true;
  texto.textContent = 'Creando imagen…';

  try {
    const blob = await generarImagenHistoria();
    if (!blob) throw new Error('sin imagen');

    // En el celular se abre el menú de compartir: desde ahí se puede
    // "Guardar imagen" en la galería o enviarla directo a Instagram.
    const archivo = new File([blob], nombre, { type: 'image/png' });
    const esCelular = window.matchMedia('(pointer: coarse)').matches;
    if (esCelular && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: RIFA.nombreCompleto });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }

    guardarArchivo(blob, nombre);
    notificar('Imagen descargada. Ya puede subirla a su historia de Instagram.');
  } catch (error) {
    notificar('No se pudo crear la imagen. Intente de nuevo.', true);
  } finally {
    boton.disabled = false;
    texto.textContent = 'Imagen para historia';
  }
}

/* ------------------------------ PIN ------------------------------ */

function mostrarPantallaPin() {
  const pantalla = $('#pantalla-pin');
  if (!pantalla.hidden) return;
  if ($('#dialogo').open) $('#dialogo').close();
  pantalla.hidden = false;
  setTimeout(() => $('#campo-pin').focus(), 50);
}

async function enviarPin(evento) {
  evento.preventDefault();
  const pin = $('#campo-pin').value.trim();
  const error = $('#error-pin');
  if (!pin) {
    error.textContent = 'Escriba el PIN.';
    error.hidden = false;
    return;
  }

  try {
    const respuesta = await fetch('/api/sesion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!respuesta.ok) {
      error.textContent = 'El PIN no es correcto. Intente de nuevo.';
      error.hidden = false;
      $('#campo-pin').select();
      return;
    }
    guardarPin(pin);
    $('#pantalla-pin').hidden = true;
    $('#campo-pin').value = '';
    error.hidden = true;
    cargarBoletos();
  } catch (e) {
    error.textContent = 'No hay conexión con el servidor.';
    error.hidden = false;
  }
}

/* ------------------------------ Notificación ------------------------------ */

let temporizadorNotificacion = null;

function notificar(mensaje, esError = false) {
  const caja = $('#notificacion');
  $('#notificacion-texto').textContent = mensaje;
  caja.classList.toggle('notificacion--error', esError);
  caja.querySelector('use').setAttribute('href', esError ? '#i-alert' : '#i-check');
  caja.hidden = false;
  clearTimeout(temporizadorNotificacion);
  temporizadorNotificacion = setTimeout(() => {
    caja.hidden = true;
  }, 5000);
}

/* ------------------------------ Eventos ------------------------------ */

function registrarEventos() {
  $('#grilla').addEventListener('click', (e) => {
    const celda = e.target.closest('.numero');
    if (celda) abrirNumero(celda.dataset.numero);
  });

  $('#lista-compradores').addEventListener('click', (e) => {
    const item = e.target.closest('.comprador');
    if (item) abrirNumero(item.dataset.numero);
  });

  document.querySelectorAll('.pestana').forEach((pestana) => {
    pestana.addEventListener('click', () => cambiarVista(pestana.dataset.vista));
  });

  // Navegación con flechas entre pestañas (patrón ARIA de pestañas).
  $('.pestanas__lista').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const vistas = ['talonario', 'compradores', 'ganador'];
    const actual = vistas.indexOf(estado.vistaActual);
    const siguiente = (actual + (e.key === 'ArrowRight' ? 1 : -1) + vistas.length) % vistas.length;
    cambiarVista(vistas[siguiente], { enfocar: true });
  });

  document.addEventListener('click', (e) => {
    const disparador = e.target.closest('[data-accion]');
    if (!disparador) return;
    const accion = disparador.dataset.accion;
    const boleto = buscarBoleto(estado.seleccionado);

    if (accion === 'recargar') cargarBoletos();
    if (accion === 'cerrar') cerrarDialogo();
    if (accion === 'cancelar-formulario') {
      if (estado.modoFormulario === 'corregir' && boleto) {
        limpiarErrores();
        mostrarDetalle(boleto);
      } else {
        cerrarDialogo();
      }
    }
    if (accion === 'corregir' && boleto) {
      mostrarFormulario('corregir', boleto);
      $('#campo-nombre').focus();
    }
    if (accion === 'pedir-anular') {
      $('#confirmar-anular').hidden = false;
      document.querySelector('[data-accion="anular"]').focus();
    }
    if (accion === 'cancelar-anular') $('#confirmar-anular').hidden = true;
    if (accion === 'cambiar-pago') cambiarPago();
    if (accion === 'anular') anularVenta();
  });

  const dialogo = $('#dialogo');
  dialogo.addEventListener('cancel', (e) => {
    if (estado.guardando) e.preventDefault();
  });
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) cerrarDialogo(); // clic fuera del contenido
  });
  dialogo.addEventListener('close', () => {
    const numero = estado.seleccionado;
    estado.seleccionado = null;
    const celda = document.querySelector(`.numero[data-numero="${numero}"]`);
    if (celda && estado.vistaActual === 'talonario') celda.focus({ preventScroll: true });
  });

  $('#form-comprador').addEventListener('submit', enviarFormulario);
  $('#form-ganador').addEventListener('submit', enviarGanador);
  $('#form-pin').addEventListener('submit', enviarPin);
  $('#buscar').addEventListener('input', renderizarCompradores);
  document.querySelectorAll('input[name="filtro-pago"]').forEach((opcion) => {
    opcion.addEventListener('change', renderizarCompradores);
  });
  document.querySelectorAll('input[name="pagado"]').forEach((opcion) => {
    opcion.addEventListener('change', () => {
      $('#campo-pagado').removeAttribute('aria-invalid');
      $('#error-pagado').hidden = true;
    });
  });
  $('#enlace-exportar').addEventListener('click', descargarLista);
  $('#boton-historia').addEventListener('click', descargarHistoria);

  $('#numero-ganador').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !$('#dialogo').open) {
      cargarBoletos({ silencioso: true });
    }
  });
}

/* ------------------------------ Inicio ------------------------------ */

/** Escribe en la página los textos de rifa.config.js. */
function aplicarConfiguracion() {
  document.querySelectorAll('[data-rifa]').forEach((nodo) => {
    const valor = RIFA[nodo.dataset.rifa];
    if (valor) nodo.textContent = valor;
  });
  const foto = $('#foto-premio');
  if (RIFA.fotoPremio) {
    foto.src = RIFA.fotoPremio;
    foto.alt = RIFA.fotoPremioDescripcion;
  }
  document.title = RIFA.nombreCompleto;
  const descripcion = document.querySelector('meta[name="description"]');
  if (descripcion) descripcion.content = `Registro de ventas de la ${RIFA.nombreCompleto}.`;
}

async function iniciar() {
  aplicarConfiguracion();
  registrarEventos();
  programarActualizacion();

  try {
    const respuesta = await fetch('/api/config', { cache: 'no-store' });
    const config = await respuesta.json();
    if (config.precio) estado.precio = config.precio;
    renderizarResumen();
    if (config.requierePin && !leerPin()) {
      mostrarPantallaPin();
      return;
    }
  } catch (e) {
    /* si falla, cargarBoletos mostrará el aviso */
  }

  await cargarBoletos();
}

iniciar();
