'use strict';

/**
 * Validacion y normalizacion de los datos de entrada de la API.
 * Cada funcion devuelve { valor } cuando el dato es correcto o
 * { error } con un mensaje listo para mostrar al usuario.
 */

function validarNumero(entrada) {
  const numero = String(entrada == null ? '' : entrada).trim();
  if (!/^\d{2}$/.test(numero)) {
    return { error: 'El numero del boleto debe tener dos digitos (00 a 99).' };
  }
  return { valor: numero };
}

function validarNombre(entrada) {
  const nombre = String(entrada == null ? '' : entrada)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (nombre.length < 3) {
    return { error: 'Escriba el nombre completo del comprador.' };
  }
  if (nombre.length > 100) {
    return { error: 'El nombre es demasiado largo (maximo 100 caracteres).' };
  }
  return { valor: nombre };
}

/**
 * Acepta formatos como "300 123 4567", "300-123-4567" o "+57 300 1234567".
 * Se almacenan unicamente los digitos.
 */
function validarTelefono(entrada) {
  const digitos = String(entrada == null ? '' : entrada).replace(/\D/g, '');

  if (digitos.length === 0) {
    return { error: 'Escriba un numero de telefono para poder avisarle si gana.' };
  }
  if (digitos.length < 7 || digitos.length > 15) {
    return { error: 'El telefono no parece valido. Revise que este completo (por ejemplo 300 123 4567).' };
  }
  return { valor: digitos };
}

function validarPagado(entrada) {
  if (typeof entrada !== 'boolean') {
    return { error: 'Indique si la persona ya pago o si queda debiendo.' };
  }
  return { valor: entrada };
}

/** Valida en conjunto los datos del comprador y su estado de pago. */
function validarComprador(cuerpo) {
  const datos = cuerpo || {};
  const errores = {};

  const nombre = validarNombre(datos.nombre);
  if (nombre.error) errores.nombre = nombre.error;

  const telefono = validarTelefono(datos.telefono);
  if (telefono.error) errores.telefono = telefono.error;

  const pagado = validarPagado(datos.pagado);
  if (pagado.error) errores.pagado = pagado.error;

  if (Object.keys(errores).length > 0) {
    return { errores };
  }
  return { valor: { nombre: nombre.valor, telefono: telefono.valor, pagado: pagado.valor } };
}

module.exports = {
  validarNumero,
  validarNombre,
  validarTelefono,
  validarPagado,
  validarComprador,
};
