/* ==========================================================================
   Datos de la rifa
   --------------------------------------------------------------------------
   Este es el ÚNICO archivo que se modifica para montar otra rifa.
   El diseño, los colores y el funcionamiento no cambian.
   El valor del boleto se configura en Railway con la variable PRECIO_BOLETO.
   ========================================================================== */

window.RIFA = {
  // Título de la página: la primera línea va en letras pequeñas espaciadas
  // y la segunda en letra grande. Ejemplo: "Gran Rifa" + "Navideña".
  antetitulo: 'Gran Rifa',
  titulo: 'Papá y Mamá Noel',

  // Nombre completo, usado en mensajes de WhatsApp y en la pestaña del navegador.
  nombreCompleto: 'Gran Rifa Papá y Mamá Noel',

  // Descripción corta del premio (se muestra después de "Premio:").
  premio: 'Pareja de muñecos de Papá Noel y Mamá Noel',

  // Foto del premio dentro de public/img/. Idealmente cuadrada, mínimo 400 px.
  fotoPremio: '/img/papa-mama-noel.jpg',
  fotoPremioDescripcion: 'Premio: muñecos de Papá Noel y Mamá Noel tomados de la mano',

  // Fecha del sorteo, tal como se quiere leer: "12 de diciembre".
  fechaSorteo: '12 de diciembre',

  // Lotería con la que se juega. Se escribe como se leería después de
  // "últimas 2 cifras de la ...". Ejemplo: "Lotería de Boyacá".
  loteria: 'Lotería de Boyacá',

  // Identificador corto sin espacios ni tildes. Se usa en los nombres de los
  // archivos descargados y para recordar el PIN en cada dispositivo.
  identificador: 'rifa-papa-mama-noel',
};
