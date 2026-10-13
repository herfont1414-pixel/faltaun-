import { NextResponse } from "next/server";

// Antes devolvía nombre y dirección del cliente para autocompletar el checkout, pero
// cualquiera podía escribir un teléfono ajeno y ver esos datos. Ya no se usa: el checkout
// completa con lo que el cliente guardó en su propio celular. Se deja la ruta respondiendo
// vacío para que una pestaña abierta con la versión anterior de la página no falle.
export async function GET() {
  return NextResponse.json({ customer: null });
}
