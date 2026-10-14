/**
 * Datos de contacto y legales de la tienda. Los usan el pie de página, las
 * páginas legales, el botón de WhatsApp y los mails de los pedidos
 * (api/_lib/mails.js), así se cambian en un solo lugar.
 */
export const CONTACT = {
  email: "nevrado.soporte@gmail.com",
  /** WhatsApp con formato internacional para wa.me (Córdoba: 54 9 351 …). */
  whatsapp: "5493518199773",
  whatsappLabel: "351 819-9773",
  instagram: "nevradotienda",
  city: "Córdoba, Argentina",
};

export const instagramUrl = `https://www.instagram.com/${CONTACT.instagram}`;

export const whatsappUrl = (text = "") =>
  `https://wa.me/${CONTACT.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** Ventanilla Única Federal de reclamos (Res. 274/2021, art. 8). */
export const CONSUMER_COMPLAINTS_URL = "https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario";
