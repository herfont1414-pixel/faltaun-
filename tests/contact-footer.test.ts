import { describe, it, expect, beforeAll } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Vitest compila el JSX del componente en modo clásico (necesita React en el ámbito).
(globalThis as unknown as { React: typeof React }).React = React;

describe("contacto al final del menú", () => {
  let html = "";
  beforeAll(async () => {
    const { ContactFooter } = await import("@/components/menu/contact-footer");
    html = renderToStaticMarkup(createElement(ContactFooter));
  });

  it("Instagram abre el perfil oficial en una pestaña nueva", () => {
    expect(html).toContain('href="https://www.instagram.com/madero_resto/"');
    expect(html).toContain("@madero_resto");
    expect(html).toContain("Seguir en Instagram");
  });

  it("WhatsApp abre una conversación directa con 543755589363, sin mensaje predefinido", () => {
    expect(html).toContain('href="https://wa.me/543755589363"');
    expect(html).not.toContain("?text=");
    expect(html).toContain("+54 3755 589363");
    expect(html).toContain("Hablar por WhatsApp");
  });

  it("los enlaces son externos y seguros, y el pie dice Madero Restó", () => {
    expect(html.match(/target="_blank"/g)).toHaveLength(2);
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(html).toContain("Madero Restó");
    expect(html).toContain("Buena comida, mejores momentos");
  });

  it("no inventa otros datos de contacto (dirección, horarios, teléfonos)", () => {
    expect(html).not.toMatch(/Av\.|Calle|Horario|tel:/i);
    expect(html.match(/href="/g)).toHaveLength(2);
  });
});
